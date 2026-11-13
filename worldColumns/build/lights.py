"""Downloads NASA's Black Marble annual night lights (VNP46A4, 2023) and
reduces each tile to sums on the fine Equal Earth grid, for layers.py:

    .venv/bin/python lights.py

VNP46A4 is calibrated radiance, nW/(cm² sr), at 15″ (about 500 m), in 540
tiles of 10° by 10°, about 100 MB each, from LAADS DAAC. It needs an
Earthdata token in ~/.earthdata_token (Generate Token on your Earthdata
profile), and LAADS approved for your account once (log in at
ladsweb.modaps.eosdis.nasa.gov). Each tile's snow-free all-angle composite
(the snow-covered one where there's no snow-free value) is summed into the
grid's cells and saved as cache/vnp46/<tile>.npz (cell, sum, count); the
tile itself is deleted. Tiles already done are skipped, so a run resumes.
"""

import json
import os
import sys
import time
import traceback
import urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from layers import FINE, Grid

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, 'cache', 'vnp46')
BASE = 'https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5200/VNP46A4/2023/001'
FIELDS = 'HDFEOS/GRIDS/VIIRS_Grid_DNB_2d/Data Fields'
FILL = -999.9
TOKEN = open(os.path.expanduser('~/.earthdata_token')).read().strip()


def log(*args):
    print(time.strftime('%H:%M:%S'), *args, flush=True)


def get(url, path=None):
    request = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}'})
    with urllib.request.urlopen(request, timeout=300) as r:
        if path is None:
            return r.read()
        with open(path, 'wb') as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)


def reduce(path, grid):
    import h5py
    with h5py.File(path) as f:
        g = f[FIELDS]
        free = g['AllAngle_Composite_Snow_Free'][:]
        snow = g['AllAngle_Composite_Snow_Covered'][:]
        lat, lon = g['lat'][:], g['lon'][:]
    radiance = np.where(free > FILL / 2, free, snow)
    valid = radiance > FILL / 2
    idx = grid.cells(lat, lon)
    ok = valid & (idx >= 0)
    cells, inverse = np.unique(idx[ok], return_inverse=True)
    sums = np.bincount(inverse, radiance[ok].astype(np.float64))
    counts = np.bincount(inverse)
    return cells, sums, counts


def run(name, grid):
    tile = name.split('.')[2]
    out = os.path.join(OUT_DIR, f'{tile}.npz')
    if os.path.exists(out):
        return
    part = os.path.join(OUT_DIR, f'{tile}.h5')
    for attempt in range(4):
        try:
            get(f'{BASE}/{name}', part)
            cells, sums, counts = reduce(part, grid)
            np.savez_compressed(out + '.tmp.npz', cells=cells, sums=sums, counts=counts)
            os.rename(out + '.tmp.npz', out)
            os.remove(part)
            log(f'{tile}: {len(cells)} cells')
            return
        except Exception:
            log(f'{tile}: attempt {attempt + 1} failed\n{traceback.format_exc()}')
            time.sleep(30 * (attempt + 1))
    log(f'{tile}: giving up')


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    listing = json.loads(get(f'{BASE}.json'))
    names = sorted(f['name'] for f in listing.get('content', listing) if f['name'].endswith('.h5'))
    grid = Grid(FINE)
    log(f'{len(names)} tiles')
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda n: run(n, grid), names))
    done = sum(os.path.exists(os.path.join(OUT_DIR, f"{n.split('.')[2]}.npz")) for n in names)
    log(f'done: {done} of {len(names)} tiles')
    sys.exit(0 if done == len(names) else 1)


if __name__ == '__main__':
    main()
