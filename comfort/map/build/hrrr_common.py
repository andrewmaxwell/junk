"""Shared helpers for the HRRR side of the pipeline.

HRRR is NOAA's 3 km hourly model for the contiguous US, archived on AWS with a
`.idx` sidecar per file that gives every field's byte offset. That is what
makes a year of it practical: each hour we fetch only the ~17 MB of fields the
comfort model reads, out of a 140 MB file.
"""

import json
import os
import time
import urllib.request

import eccodes
import numpy as np

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(BUILD_DIR, 'cache')
GRID_DIR = os.path.join(CACHE_DIR, 'grid')
DATA_DIR = os.path.join(BUILD_DIR, '..', 'data')

HRRR_URL = 'https://noaa-hrrr-bdp-pds.s3.amazonaws.com'


def hrrr_file(run, forecast_hour=1):
    """URL of the surface file for a model run (a UTC datetime)."""
    return (
        f'{HRRR_URL}/hrrr.{run:%Y%m%d}/conus/'
        f'hrrr.t{run:%H}z.wrfsfcf{forecast_hour:02d}.grib2'
    )


def get(url, byte_range=None, attempts=6):
    """GET with retries; S3 occasionally drops a connection under load."""
    for attempt in range(attempts):
        request = urllib.request.Request(url)
        if byte_range:
            request.add_header('Range', f'bytes={byte_range[0]}-{byte_range[1]}')
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2 * (attempt + 1))


def read_index(url):
    """[(field:level:step, start, end)] from a `.idx` file, end exclusive."""
    lines = get(url + '.idx').decode().strip().split('\n')
    entries = []
    for i, line in enumerate(lines):
        parts = line.split(':')
        start = int(parts[1])
        end = int(lines[i + 1].split(':')[1]) if i + 1 < len(lines) else None
        entries.append((':'.join(parts[3:6]), start, end))
    return entries


def fetch_fields(url, patterns):
    """Decoded values for each `field:level` prefix, keyed by that prefix."""
    index = read_index(url)
    out = {}
    for pattern in patterns:
        match = next((e for e in index if e[0].startswith(pattern + ':')), None)
        if match is None:
            raise KeyError(f'{pattern} not in {url}')
        _, start, end = match
        message = get(url, (start, end - 1 if end else ''))
        handle = eccodes.codes_new_from_message(message)
        try:
            out[pattern] = eccodes.codes_get_values(handle).astype(np.float32)
        finally:
            eccodes.codes_release(handle)
    return out


def load_grid():
    """The cells the map covers, as written by `grid.py`."""
    with open(os.path.join(GRID_DIR, 'grid.json')) as f:
        meta = json.load(f)
    load = lambda name, dtype: np.fromfile(os.path.join(GRID_DIR, name), dtype)
    meta['cells'] = load('cells.u32', np.uint32)
    meta['lat'] = load('lat.f32', np.float32)
    meta['lon'] = load('lon.f32', np.float32)
    return meta
