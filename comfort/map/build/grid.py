"""Works out which HRRR cells the map covers, once.

    .venv/bin/python grid.py

Writes to cache/grid/: the flat index of every cell within a few km of the
Lower 48, its latitude and longitude, and its IANA time zone (so "waking
hours" can mean local time, as it does in the app).
"""

import json
import os
from datetime import datetime

import eccodes
import numpy as np
import shapely
from timezonefinder import TimezoneFinder

from hrrr_common import GRID_DIR, get, hrrr_file, read_index

NATION_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/nation-10m.json'
LOWER_48 = (-125.5, 24, -66, 50)  # lon/lat box that excludes Alaska and Hawaii
# Cells just offshore are kept so the coastline is never short a pixel when
# the page clips to it.
BUFFER_DEGREES = 0.06


def lower_48_outline():
    topology = json.loads(get(NATION_URL))
    scale, translate = topology['transform']['scale'], topology['transform']['translate']
    arcs = []
    for arc in topology['arcs']:
        points = np.cumsum(np.array(arc, dtype=np.float64), axis=0)
        arcs.append(points * scale + translate)

    def ring(indexes):
        parts = [arcs[~i][::-1] if i < 0 else arcs[i] for i in indexes]
        return np.concatenate([parts[0]] + [p[1:] for p in parts[1:]])

    polygons = []
    for geometry in topology['objects']['nation']['geometries']:
        for polygon in geometry['arcs']:
            shell, *holes = [ring(r) for r in polygon]
            polygons.append(shapely.Polygon(shell, holes))
    box = shapely.box(*LOWER_48)
    return shapely.union_all([p for p in polygons if p.intersects(box)]).intersection(box)


def main():
    os.makedirs(GRID_DIR, exist_ok=True)

    # Any recent file has the grid; LAND is one of its smallest fields.
    url = hrrr_file(datetime(2025, 10, 21, 18))
    _, start, end = next(e for e in read_index(url) if e[0].startswith('LAND:surface:'))
    handle = eccodes.codes_new_from_message(get(url, (start, end - 1)))
    nx = eccodes.codes_get(handle, 'Nx')
    ny = eccodes.codes_get(handle, 'Ny')
    lats = eccodes.codes_get_array(handle, 'latitudes')
    lons = eccodes.codes_get_array(handle, 'longitudes')
    projection = {
        'lat1': eccodes.codes_get(handle, 'Latin1InDegrees'),
        'lat2': eccodes.codes_get(handle, 'Latin2InDegrees'),
        'lon0': eccodes.codes_get(handle, 'LoVInDegrees') - 360,
        'radius': eccodes.codes_get(handle, 'radius'),
        'dx': eccodes.codes_get(handle, 'DxInMetres'),
        'firstLat': eccodes.codes_get(handle, 'latitudeOfFirstGridPointInDegrees'),
        'firstLon': eccodes.codes_get(handle, 'longitudeOfFirstGridPointInDegrees') - 360,
    }
    eccodes.codes_release(handle)
    lons = np.where(lons > 180, lons - 360, lons)

    outline = lower_48_outline().buffer(BUFFER_DEGREES)
    inside = shapely.contains_xy(outline, lons, lats)
    cells = np.flatnonzero(inside).astype(np.uint32)
    print(f'{len(cells)} of {nx * ny} cells')

    finder = TimezoneFinder(in_memory=True)
    names = []
    zone_index = {}
    zones = np.empty(len(cells), np.uint8)
    for n, cell in enumerate(cells):
        name = finder.timezone_at(lng=float(lons[cell]), lat=float(lats[cell]))
        if name not in zone_index:
            zone_index[name] = len(names)
            names.append(name)
        zones[n] = zone_index[name]

    cells.tofile(os.path.join(GRID_DIR, 'cells.u32'))
    lats[cells].astype(np.float32).tofile(os.path.join(GRID_DIR, 'lat.f32'))
    lons[cells].astype(np.float32).tofile(os.path.join(GRID_DIR, 'lon.f32'))
    zones.tofile(os.path.join(GRID_DIR, 'zone.u8'))
    with open(os.path.join(GRID_DIR, 'grid.json'), 'w') as f:
        json.dump({'nx': nx, 'ny': ny, 'count': len(cells), 'zones': names,
                   'projection': projection}, f)
    print(f'{len(names)} time zones')


if __name__ == '__main__':
    main()
