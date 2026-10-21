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
import time
import zipfile
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


VARIABLES = {
    'particulate_matter_2.5um': 'pm2p5',
    'uv_biologically_effective_dose': 'uvbed',
    'ozone': 'go3',  # model level 137, the one touching the ground
}


def retrieve(first, last):
    """Every variable over the dates, as hourly (time, lat, lon) arrays.

    One request per call: the Atmosphere Data Store queues only one request
    per user for this dataset, and older months come off tape slowly, so
    fewer, larger requests are what keeps a year's worth tolerable. Each day's
    00 UTC run, hours 0 to 23, stitches into a continuous hourly series.
    """
    import xarray as xr
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, 'cams.download')
        client().retrieve(DATASET, {
            'variable': list(VARIABLES),
            'model_level': ['137'],
            'date': [f'{first}/{last}'],
            'time': ['00:00'],
            'leadtime_hour': [str(h) for h in range(24)],
            'type': ['forecast'],
            'data_format': 'netcdf',
            'area': AREA,
        }, path)
        # Surface and model-level fields arrive as two files in a zip, and
        # must not be merged as they are: the model-level file counts
        # longitude 0-360 where the surface one uses ±180, and archived
        # model-level ozone is only 3-hourly. Merging silently doubled the
        # grid and left two hours in three without ozone.
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as archive:
                archive.extractall(tmp)
                files = [os.path.join(tmp, n) for n in archive.namelist()]
        else:
            files = [path]
        datasets = [xr.open_dataset(p).load() for p in files]

    def hourly(data, name):
        values = data[name]
        if 'model_level' in values.dims:
            values = values.isel(model_level=0)
        values = values.transpose('forecast_reference_time', 'forecast_period',
                                  'latitude', 'longitude')
        times = data['valid_time'].transpose('forecast_reference_time', 'forecast_period')
        hours = times.values.reshape(-1).astype('datetime64[h]').astype(np.int64)
        lons = data['longitude'].values
        lons = np.where(lons > 180, lons - 360, lons)
        return hours, data['latitude'].values, lons, values.values.reshape(-1, *values.shape[2:])

    found = {name: hourly(d, name) for d in datasets for name in d.data_vars
             if name in VARIABLES.values()}
    # The surface fields are hourly, so they set the time axis and the grid.
    hours, lats, lons, _ = found['pm2p5']
    series = {}
    for name, (own_hours, own_lats, own_lons, values) in found.items():
        if not (np.allclose(own_lats, lats) and np.allclose(own_lons, lons)):
            raise ValueError(f'{name} is on a different grid')
        if not np.array_equal(own_hours, hours):
            # Linear in time, per cell, onto the hourly axis.
            position = np.interp(hours, own_hours, np.arange(len(own_hours)))
            i0 = np.minimum(np.floor(position).astype(int), len(own_hours) - 2)
            w = (position - i0)[:, None, None]
            values = values[i0] * (1 - w) + values[i0 + 1] * w
        series[name] = values
    stamps = [np.datetime_as_string(np.datetime64(int(h), 'h'), unit='h')
              .replace('-', '').replace('T', '') for h in hours]
    return stamps, lats, lons, series


def download_month(month, first_day, last_day):
    """Writes cache/cams/<month>.npz covering the month within the range."""
    year, mo = map(int, month.split('-'))
    month_start = date(year, mo, 1)
    month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    first, last = max(month_start, first_day), min(month_end, last_day)
    path = os.path.join(CAMS_DIR, f'{month}.npz')
    if os.path.exists(path):
        cached = np.load(path)
        cached_first = str(cached['first_day']) if 'first_day' in cached.files else f'{month}-01'
        if cached_first <= str(first) and str(cached['last_day']) >= str(last):
            return
    print(f'{month}: requesting {first} to {last}', flush=True)
    started = time.time()
    # A day early, so the 24-hour PM2.5 mean is complete from the first hour.
    stamps, lats, lons, s = retrieve(first - timedelta(days=1), last)

    aqi = np.maximum(
        index_from(PM25_CURVE, rolling_mean(s['pm2p5'] * 1e9, 24)),  # kg/m³ to µg/m³
        index_from(O3_CURVE, rolling_mean(s['go3'] * O3_KG_KG_TO_PPB, 8)),
    )
    keep = [i for i, t in enumerate(stamps) if t[:6] == f'{year}{mo:02d}']
    os.makedirs(CAMS_DIR, exist_ok=True)
    np.savez_compressed(
        path + '.part.npz',
        times=np.array([stamps[i] for i in keep]),
        lats=lats, lons=lons,
        uv=(s['uvbed'][keep] * UV_INDEX_PER_W).astype(np.float32),
        aqi=aqi[keep].astype(np.float32),
        first_day=str(first),
        last_day=str(last),
    )
    os.replace(path + '.part.npz', path)
    print(f'{month}: {len(keep)} hours in {(time.time() - started) / 60:.0f} min', flush=True)


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
    # Strictly one at a time and in calendar order: the store rejects a
    # second queued request, and `hrrr.py` waits on each month in turn.
    for month in months:
        download_month(month, start - timedelta(days=1), end_utc)


if __name__ == '__main__':
    main()
