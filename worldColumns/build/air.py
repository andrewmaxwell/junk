"""Marks the hours when the air outside was bad enough to keep the windows shut:
desert dust, wildfire smoke and city pollution.

    .venv/bin/python air.py --start 2025-11-01 --end 2026-10-31

Downloads CAMS global atmospheric composition forecasts (0.4°, hourly, from
the Atmosphere Data Store) a month at a time: PM10, which is where dust and
sand show up, and PM2.5, which is mostly smoke and pollution. Each day's 00 UTC
run, hours 0 to 23, stitches into a continuous hourly series. An hour is bad
where either is above the US EPA's "unhealthy for sensitive groups" line (AQI
100). The EPA applies those to 24-hour means; here they are applied to each
hour, because that is when you'd decide to shut the window.

Writes cache/air/<YYYY-MM>.npz: for each hour ('YYYYMMDDHH' UTC in `stamps`),
a packed bit per CAMS cell (451 x 900, from 90°N and 0°E) set where the air was
bad. The store queues one request per user, so months go one at a time; a
month that is already there is skipped.
"""

import argparse
import os
import re
import time
from datetime import date, timedelta

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
AIR_DIR = os.path.join(HERE, 'cache', 'air')
ADS_URL = 'https://ads.atmosphere.copernicus.eu/api'
DATASET = 'cams-global-atmospheric-composition-forecasts'
NI, NJ = 900, 451
STEP = 0.4

PM10_LIMIT = 154  # µg/m³, the top of AQI 100 for PM10
PM25_LIMIT = 35.4  # µg/m³, the same for PM2.5 (2024 breakpoints)


def client():
    import cdsapi
    with open(os.path.expanduser('~/.cdsapirc')) as f:
        key = re.search(r'^key:\s*(\S+)', f.read(), re.M).group(1)
    return cdsapi.Client(url=ADS_URL, key=key, quiet=True, progress=False)


def months(start, end):
    out = []
    cursor = start.replace(day=1)
    while cursor <= end:
        month_end = (cursor + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        out.append((max(cursor, start), min(month_end, end)))
        cursor = month_end + timedelta(days=1)
    return out


def reduce(path):
    """Bad-air bits per hour from a GRIB of pm10 and pm2p5, kg/m³."""
    import eccodes
    fields = {}
    with open(path, 'rb') as f:
        while (gid := eccodes.codes_grib_new_from_file(f)) is not None:
            try:
                assert eccodes.codes_get(gid, 'Ni') == NI and eccodes.codes_get(gid, 'Nj') == NJ
                stamp = f"{eccodes.codes_get(gid, 'validityDate')}{eccodes.codes_get(gid, 'validityTime') // 100:02d}"
                name = eccodes.codes_get(gid, 'shortName')
                values = eccodes.codes_get_values(gid) * 1e9  # to µg/m³
            finally:
                eccodes.codes_release(gid)
            limit = {'pm10': PM10_LIMIT, 'pm2p5': PM25_LIMIT}[name]
            bad = values > limit
            fields[stamp] = fields[stamp] | bad if stamp in fields else bad
    stamps = sorted(fields)
    return stamps, np.stack([np.packbits(fields[s]) for s in stamps])


def fetch_month(first, last):
    out = os.path.join(AIR_DIR, f'{first:%Y-%m}.npz')
    if os.path.exists(out):
        return
    grib = os.path.join(AIR_DIR, f'{first:%Y-%m}.grib')
    for attempt in range(5):
        try:
            print(time.strftime('%H:%M:%S'), f'{first} – {last}: requesting', flush=True)
            started = time.time()
            client().retrieve(DATASET, {
                'variable': ['particulate_matter_10um', 'particulate_matter_2.5um'],
                'date': [f'{first}/{last}'],
                'time': ['00:00'],
                'leadtime_hour': [str(h) for h in range(24)],
                'type': ['forecast'],
                'data_format': 'grib',
            }, grib)
            stamps, bits = reduce(grib)
            expected = ((last - first).days + 1) * 24
            if len(stamps) != expected:
                raise ValueError(f'{len(stamps)} hours, expected {expected}')
            np.savez_compressed(out + '.tmp.npz', stamps=np.array(stamps), bad=bits,
                                ni=NI, nj=NJ, step=STEP)
            os.rename(out + '.tmp.npz', out)
            os.remove(grib)
            print(time.strftime('%H:%M:%S'), f'{first} – {last}: {len(stamps)} hours in '
                  f'{(time.time() - started) / 60:.0f} min', flush=True)
            return
        except Exception as e:
            print(time.strftime('%H:%M:%S'), f'{first} – {last}: attempt {attempt + 1} failed: {e}', flush=True)
            time.sleep(60 * (attempt + 1))
    print(time.strftime('%H:%M:%S'), f'{first} – {last}: giving up', flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    args = parser.parse_args()
    os.makedirs(AIR_DIR, exist_ok=True)
    todo = months(date.fromisoformat(args.start), date.fromisoformat(args.end))
    for first, last in todo:
        fetch_month(first, last)
    done = sum(os.path.exists(os.path.join(AIR_DIR, f'{f:%Y-%m}.npz')) for f, _ in todo)
    print(time.strftime('%H:%M:%S'), f'done: {done} of {len(todo)} months', flush=True)


if __name__ == '__main__':
    main()
