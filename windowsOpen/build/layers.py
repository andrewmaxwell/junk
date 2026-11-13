"""Makes the other maps the page can switch to, on the same grid as the
open-window map:

    .venv/bin/python layers.py

  elevation  ERA5-Land's own surface height (its geopotential over g), 0.1°,
             so it is the terrain the weather was computed over. Downloaded
             from the Climate Data Store on the first run.
  population GHS-POP R2023A, the EU Joint Research Centre's estimate of where
             people live in 2025, 30″ (about 1 km). Download and unzip
             GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.zip from
             https://ghsl.jrc.ec.europa.eu/download.php?ds=pop into
             cache/sources/ first. Summed into each 0.1° cell and divided by
             the cell's area, so it is people per km².

Each becomes ../data/<name>.png: the value as a 16-bit number, high byte in
R and low byte in G, 65535 off land (the weather's land mask, so the maps
line up). Elevation is in metres, floored at 0; population in people per
km², capped at 65534. ../data/layers.json says so.
"""

import glob
import json
import os

import numpy as np
from PIL import Image

from export import DATA_DIR, equal_earth
from fetch import CHUNK_DIR, MISSING, NI, NJ

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, 'cache', 'sources')
GEOPOTENTIAL = os.path.join(SOURCES, 'era5land_geopotential.grib')
POPULATION = os.path.join(SOURCES, 'GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif')
NO_DATA = 65535
G = 9.80665


def elevation():
    import eccodes
    if not os.path.exists(GEOPOTENTIAL):
        import cdsapi
        cdsapi.Client(quiet=True, progress=False).retrieve('reanalysis-era5-land', {
            'variable': ['geopotential'], 'year': '2026', 'month': '01', 'day': ['01'],
            'time': ['00:00'], 'data_format': 'grib', 'download_format': 'unarchived',
        }, GEOPOTENTIAL)
    with open(GEOPOTENTIAL, 'rb') as f:
        gid = eccodes.codes_grib_new_from_file(f)
        values = eccodes.codes_get_values(gid)
        eccodes.codes_release(gid)
    values = np.where(values == MISSING, 0, values / G)
    return np.maximum(values, 0).reshape(NJ, NI)


def population():
    """People per km² in each 0.1° cell."""
    import tifffile
    people = np.zeros(NJ * NI)
    with tifffile.TiffFile(POPULATION) as tif:
        page = tif.pages[0]
        scale_x, scale_y, _ = page.tags['ModelPixelScaleTag'].value
        _, _, _, west, north, _ = page.tags['ModelTiepointTag'].value
        tiles_across = -(-page.shape[1] // page.tilewidth)
        for index, tile in _tiles(page):
            ty, tx = divmod(index, tiles_across)
            h, w = tile.shape
            lat = north - (ty * page.tilelength + np.arange(h) + 0.5) * scale_y
            lon = west + (tx * page.tilewidth + np.arange(w) + 0.5) * scale_x
            rows = np.clip(np.round((90 - lat) / 0.1).astype(int), 0, NJ - 1)
            cols = np.round(np.mod(lon, 360) / 0.1).astype(int) % NI
            cells = rows[:, None] * NI + cols[None, :]
            ok = tile > 0
            people += np.bincount(cells[ok], tile[ok], NJ * NI)
    lat = 90 - np.arange(NJ) * 0.1
    side = 40075.017 / 3600  # km per 0.1° at the equator
    area = side * side * np.maximum(np.cos(np.radians(lat)), 1e-6)
    return people.reshape(NJ, NI) / area[:, None]


def _tiles(page):
    """(index, tile) for each tile of a tiled TIFF page, decoded one at a time."""
    fh = page.parent.filehandle
    for index, (offset, count) in enumerate(zip(page.dataoffsets, page.databytecounts)):
        if not count:
            continue
        fh.seek(offset)
        data, _, _ = page.decode(fh.read(count), index)
        # Edge tiles are padded out to a whole tile; clip them.
        tile = data.reshape(page.tilelength, page.tilewidth)
        ty, tx = divmod(index, -(-page.shape[1] // page.tilewidth))
        h = min(page.tilelength, page.shape[0] - ty * page.tilelength)
        w = min(page.tilewidth, page.shape[1] - tx * page.tilewidth)
        yield index, tile[:h, :w]


def main():
    land = np.load(sorted(glob.glob(os.path.join(CHUNK_DIR, '*.npz')))[0])['land']
    row, col, on_land, _, _ = equal_earth(land)
    info = {'encoding': {'noData': NO_DATA, 'bytes': 'R high, G low'}, 'layers': {}}
    for name, unit, values in [('elevation', 'm', elevation()), ('population', 'people/km²', population())]:
        v = np.clip(np.round(values[row, col]), 0, NO_DATA - 1).astype(np.uint16)
        v = np.where(on_land, v, NO_DATA)
        rgb = np.zeros(v.shape + (3,), np.uint8)
        rgb[..., 0] = v >> 8
        rgb[..., 1] = v & 255
        path = os.path.join(DATA_DIR, f'{name}.png')
        Image.fromarray(rgb).save(path, optimize=True)
        shown = v[on_land]
        info['layers'][name] = {'unit': unit, 'max': int(shown.max())}
        print(f'{name}: land median {np.median(shown):.0f} {unit}, 99th {np.percentile(shown, 99):.0f}, '
              f'max {shown.max()}, {os.path.getsize(path) / 1e6:.1f} MB')
    with open(os.path.join(DATA_DIR, 'layers.json'), 'w') as f:
        json.dump(info, f, indent=2)


if __name__ == '__main__':
    main()
