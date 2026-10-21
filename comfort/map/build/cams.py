"""UV index and US AQI from CAMS, for the hours HRRR does not cover.

    .venv/bin/python cams.py --start 2026-10-13 --end 2026-10-19

Downloads CAMS global composition forecasts (0.4°) a month at a time from the
Atmosphere Data Store, works out hourly UV index and US AQI on the CAMS grid,
and caches them as cache/cams/<YYYY-MM>.npz. `hrrr.py` interpolates those onto
the 3 km grid hour by hour; both vary slowly enough in space for that to be
fair, and neither is in HRRR.
"""

import argparse
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import numpy as np

from hrrr_common import CACHE_DIR

CAMS_DIR = os.path.join(CACHE_DIR, 'cams')
ADS_URL = 'https://ads.atmosphere.copernicus.eu/api'
DATASET = 'cams-global-atmospheric-composition-forecasts'
AREA = [50, -125.5, 24, -66]  # north, west, south, east; a cell past the HRRR mask

# The UV index is erythemally weighted irradiance in units of 25 mW/m².
UV_INDEX_PER_W = 40
# Ozone mass mixing ratio to ppb by volume: air's molar mass over ozone's.
O3_KG_KG_TO_PPB = 28.9647 / 47.9982 * 1e9

# US EPA breakpoints (PM2.5 as revised in 2024), [concentration, index] pairs
# interpolated linearly between, as the EPA's own formula does.
PM25_CURVE = [(0, 0), (9.0, 50), (35.4, 100), (55.4, 150), (125.4, 200),
              (225.4, 300), (325.4, 500)]
O3_CURVE = [(0, 0), (54, 50), (70, 100), (85, 150), (105, 200), (200, 300)]


def index_from(curve, concentration):
    xs, ys = zip(*curve)
    return np.interp(concentration, xs, ys)


def rolling_mean(values, hours):
    """Trailing mean over the last `hours` along axis 0 (shorter at the start)."""
    cumulative = np.cumsum(values, axis=0, dtype=np.float64)
    out = cumulative.copy()
    out[hours:] = cumulative[hours:] - cumulative[:-hours]
    counts = np.minimum(np.arange(1, len(values) + 1), hours)
    return out / counts[:, None, None]


def client():
    import cdsapi
    with open(os.path.expanduser('~/.cdsapirc')) as f:
        key = re.search(r'^key:\s*(\S+)', f.read(), re.M).group(1)
    return cdsapi.Client(url=ADS_URL, key=key, quiet=True, progress=False)


def retrieve(first, last, request):
    """One CAMS request as an hourly (time, lat, lon) array plus its axes.

    Each day's 00 UTC run, hours 0 to 23, stitches into a continuous series.
    """
    import xarray as xr
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'cams.nc')
        client().retrieve(DATASET, {
            'date': [f'{first}/{last}'],
            'time': ['00:00'],
            'leadtime_hour': [str(h) for h in range(24)],
            'type': ['forecast'],
            'data_format': 'netcdf',
            'area': AREA,
            **request,
        }, path)
        data = xr.open_dataset(path).load()
    name = list(data.data_vars)[0]
    values = data[name]
    if 'model_level' in values.dims:
        values = values.isel(model_level=0)
    # forecast_period × reference time, flattened in time order.
    values = values.transpose('forecast_reference_time', 'forecast_period',
                              'latitude', 'longitude')
    times = data['valid_time'].transpose('forecast_reference_time', 'forecast_period')
    series = values.values.reshape(-1, *values.shape[2:])
    stamps = [np.datetime_as_string(t, unit='h').replace('-', '').replace('T', '')
              for t in times.values.reshape(-1)]
    return stamps, data['latitude'].values, data['longitude'].values, series


def download_month(month, last_day):
    """Writes cache/cams/<month>.npz covering the month up to `last_day`."""
    year, mo = map(int, month.split('-'))
    first = date(year, mo, 1)
    month_end = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    last = min(month_end, last_day)
    path = os.path.join(CAMS_DIR, f'{month}.npz')
    if os.path.exists(path) and str(np.load(path)['last_day']) >= str(last):
        return
    # A day early, so the 24-hour PM2.5 mean is complete from the first hour.
    lead_in = first - timedelta(days=1)
    stamps, lats, lons, pm = retrieve(lead_in, last, {
        'variable': ['particulate_matter_2.5um']})
    _, _, _, uv = retrieve(lead_in, last, {
        'variable': ['uv_biologically_effective_dose']})
    _, _, _, o3 = retrieve(lead_in, last, {
        'variable': ['ozone'], 'model_level': ['137']})

    aqi = np.maximum(
        index_from(PM25_CURVE, rolling_mean(pm * 1e9, 24)),  # kg/m³ to µg/m³
        index_from(O3_CURVE, rolling_mean(o3 * O3_KG_KG_TO_PPB, 8)),
    )
    keep = [i for i, s in enumerate(stamps) if s[:6] == f'{year}{mo:02d}']
    os.makedirs(CAMS_DIR, exist_ok=True)
    np.savez_compressed(
        path + '.part.npz',
        times=np.array([stamps[i] for i in keep]),
        lats=lats, lons=lons,
        uv=(uv[keep] * UV_INDEX_PER_W).astype(np.float32),
        aqi=aqi[keep].astype(np.float32),
        last_day=str(last),
    )
    os.replace(path + '.part.npz', path)
    print(f'{month}: {len(keep)} hours', flush=True)


class CamsMonth:
    """Hourly UV and AQI for one month, sampled at the HRRR cells."""

    def __init__(self, times, lats, lons, uv, aqi, lat, lon):
        self.index = {t: i for i, t in enumerate(times)}
        # Bilinear weights from the CAMS grid to every HRRR cell, once.
        def axis(points, values):
            ascending = points[1] > points[0]
            p = points if ascending else points[::-1]
            f = np.interp(values, p, np.arange(len(p)))
            if not ascending:
                f = len(p) - 1 - f
            i0 = np.clip(np.floor(f).astype(int), 0, len(p) - 2)
            return i0, f - i0
        self.y0, self.fy = axis(lats, lat)
        self.x0, self.fx = axis(lons, lon)
        self.uv, self.aqi = uv, aqi

    def _sample(self, field):
        y0, x0, fy, fx = self.y0, self.x0, self.fy, self.fx
        return (field[y0, x0] * (1 - fy) * (1 - fx) + field[y0, x0 + 1] * (1 - fy) * fx
                + field[y0 + 1, x0] * fy * (1 - fx) + field[y0 + 1, x0 + 1] * fy * fx)

    def at(self, when):
        i = self.index.get(when.strftime('%Y%m%d%H'))
        if i is None:
            return None, None
        return (self._sample(self.uv[i]).astype(np.float32),
                self._sample(self.aqi[i]).astype(np.float32))

    @staticmethod
    def load(month, lat, lon):
        path = os.path.join(CAMS_DIR, f'{month}.npz')
        if not os.path.exists(path):
            return None
        data = np.load(path)
        return CamsMonth(list(data['times']), data['lats'], data['lons'],
                         data['uv'], data['aqi'], lat, lon)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    args = parser.parse_args()
    start, end = date.fromisoformat(args.start), date.fromisoformat(args.end)
    # A day either side: local dates run up to eight hours past UTC ones.
    end_utc = end + timedelta(days=1)
    months = []
    cursor = start.replace(day=1)
    while cursor <= end_utc:
        months.append(f'{cursor:%Y-%m}')
        cursor = (cursor + timedelta(days=32)).replace(day=1)
    # The ADS queues requests per user; a few at once keeps it busy without
    # tripping its limits.
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda m: download_month(m, end_utc), months))


if __name__ == '__main__':
    main()
