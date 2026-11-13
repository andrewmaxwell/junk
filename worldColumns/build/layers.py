"""Makes the other maps the page can switch to:

    .venv/bin/python layers.py [name ...]

Each is binned straight from its source onto an Equal Earth grid, most of
them twice as fine as the open-window map (7200 cells across, about 5.5 km),
since they don't depend on ERA5-Land's 9 km weather:

  elevation   ETOPO 2022 (NOAA), 60″: the highest point in each cell, in
              metres, floored at 0. The highest point, not the average, so
              mountain ranges keep their peaks.
  population  GHS-POP R2023A (EU Joint Research Centre), 2025 estimate, 30″:
              people in each cell over its area, people per km² halved (to fit 16 bits).
  lights      Black Marble VNP46A4 (NASA), 2023, 15″: mean calibrated
              radiance at night, nW/(cm² sr), stored times 10; from the tiles
              lights.py downloads and reduces.
  travel      Nelson 2019, 30″ (layer 11): average minutes to the nearest
              city of at least 50,000 people in 2015, the definition of
              Weiss et al. 2018.
  rain        ERA5-Land monthly means, 0.1°, Nov 2025 to Oct 2026: total
              rain and snow in mm, on the open-window map's own grid.

Land is where most of a cell is above sea level in ETOPO and ERA5-Land has
land within 0.1° (which keeps big lakes as water), plus anywhere ERA5-Land
has solid land all around (which keeps the Dead Sea and the Caspian lowlands).

Sources go in cache/sources/ (download links in the README). Each map
becomes ../data/<name>.png: a 16-bit value, high byte in R and low byte in G,
65535 off land, and ../data/layers.json gives each one's grid and units.
"""

import calendar
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

from export import A1, A2, A3, A4, DATA_DIR, M, SOUTH, equal_earth, forward, inverse
from fetch import CHUNK_DIR, MISSING, NI, NJ

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, 'cache', 'sources')
NO_DATA = 65535
FINE = 7200  # cells across for the maps that have the detail for it
EARTH_KM = 6371.0
BAND = 600  # source rows binned at a time


class Grid:
    """An Equal Earth grid `width` cells across, and the cell each source
    pixel falls in."""

    def __init__(self, width):
        self.x_max, _ = forward(180, 0)
        _, self.y_max = forward(0, 90)
        _, y_min = forward(0, SOUTH)
        self.width = width
        self.cell = 2 * self.x_max / width
        self.height = int(np.ceil((self.y_max - y_min) / self.cell))
        self.km2 = (self.cell * EARTH_KM) ** 2  # every cell has the same area

    def cells(self, lat, lon):
        """Flat cell index for each (lat row, lon column) pixel, -1 off the grid."""
        t = np.arcsin(M * np.sin(np.radians(lat)))
        y = A4 * t**9 + A3 * t**7 + A2 * t**3 + A1 * t
        stretch = 2 * np.sqrt(3) * np.cos(t) / (3 * (9 * A4 * t**8 + 7 * A3 * t**6 + 3 * A2 * t**2 + A1))
        row = np.floor((self.y_max - y) / self.cell).astype(np.int64)
        x = np.radians(lon)[None, :] * stretch[:, None]
        col = np.clip(np.floor((x + self.x_max) / self.cell).astype(np.int64), 0, self.width - 1)
        out = row[:, None] * self.width + col
        return np.where(((row >= 0) & (row < self.height))[:, None], out, -1)


class Bins:
    """Sum, count and max of the values landing in each cell."""

    def __init__(self, grid, keep_max=False):
        self.grid = grid
        n = grid.width * grid.height
        self.sum = np.zeros(n)
        self.count = np.zeros(n)
        self.max = np.full(n, -np.inf) if keep_max else None

    def add(self, lat, lon, values, valid):
        idx = self.grid.cells(lat, lon)
        ok = valid & (idx >= 0)
        idx, v = idx[ok], values[ok].astype(np.float64)
        n = len(self.sum)
        self.sum += np.bincount(idx, v, n)
        self.count += np.bincount(idx, minlength=n)
        if self.max is not None:
            np.maximum.at(self.max, idx, v)

    def shaped(self, a):
        return a.reshape(self.grid.height, self.grid.width)


def pixel_centres(first, step, n):
    return first + (np.arange(n) + 0.5) * step


def tiff(name):
    """(image, lat of each row, lon of each column) for a north-up GeoTIFF."""
    import tifffile
    with tifffile.TiffFile(os.path.join(SOURCES, name)) as t:
        page = t.pages[0]
        sx, sy, _ = page.tags['ModelPixelScaleTag'].value
        _, _, _, west, north, _ = page.tags['ModelTiepointTag'].value
        image = page.asarray()
    lat = north - (np.arange(image.shape[0]) + 0.5) * sy
    lon = pixel_centres(west, sx, image.shape[1])
    return image, lat, lon


def bands(n):
    for r in range(0, n, BAND):
        yield slice(r, min(r + BAND, n))


# --- land --------------------------------------------------------------------

def era5_land():
    return np.load(sorted(glob.glob(os.path.join(CHUNK_DIR, '*.npz')))[0])['land']


def etopo():
    import h5py
    f = h5py.File(os.path.join(SOURCES, 'ETOPO_2022_v1_60s_N90W180_surface.nc'))
    return f['z'], f['lat'][:], f['lon'][:]


def land_mask(grid, z_bins_above, z_bins_all):
    land = era5_land()
    near = land.copy()  # ERA5-Land land within one cell
    solid = land.copy()  # ERA5-Land land with land all around
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            shifted = np.roll(np.roll(land, dy, 0), dx, 1)
            near |= shifted
            solid &= shifted
    # each fine cell's ERA5-Land cell
    xs = -grid.x_max + (np.arange(grid.width) + 0.5) * grid.cell
    ys = grid.y_max - (np.arange(grid.height) + 0.5) * grid.cell
    from export import inverse
    lon, lat = inverse(*np.meshgrid(xs, ys))
    inside = np.abs(lon) <= 180
    col = np.round(np.mod(lon, 360) / 0.1).astype(int) % NI
    row = np.clip(np.round((90 - lat) / 0.1).astype(int), 0, NJ - 1)
    above = z_bins_above.shaped(z_bins_above.count) * 2 >= np.maximum(z_bins_all.shaped(z_bins_all.count), 1)
    return inside & ((above & near[row, col]) | solid[row, col])


# --- layers ------------------------------------------------------------------

def elevation(grid):
    z, lat, lon = etopo()
    every, above = Bins(grid, keep_max=True), Bins(grid)
    for s in bands(len(lat)):
        values = z[s]
        every.add(lat[s], lon, values, np.ones(values.shape, bool))
        above.add(lat[s], lon, values, values > 0)
    land = land_mask(grid, above, every)
    return np.maximum(every.shaped(every.max), 0), land


def population(grid):
    import tifffile
    bins = Bins(grid)
    with tifffile.TiffFile(os.path.join(SOURCES, 'GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif')) as t:
        page = t.pages[0]
        sx, sy, _ = page.tags['ModelPixelScaleTag'].value
        _, _, _, west, north, _ = page.tags['ModelTiepointTag'].value
        across = -(-page.shape[1] // page.tilewidth)
        fh = page.parent.filehandle
        for index, (offset, count) in enumerate(zip(page.dataoffsets, page.databytecounts)):
            if not count:
                continue
            fh.seek(offset)
            data, _, _ = page.decode(fh.read(count), index)
            ty, tx = divmod(index, across)
            h = min(page.tilelength, page.shape[0] - ty * page.tilelength)
            w = min(page.tilewidth, page.shape[1] - tx * page.tilewidth)
            tile = data.reshape(page.tilelength, page.tilewidth)[:h, :w]
            lat = north - (ty * page.tilelength + np.arange(h) + 0.5) * sy
            lon = pixel_centres(west + tx * page.tilewidth * sx, sx, w)
            bins.add(lat, lon, tile, tile > 0)
    return bins.shaped(bins.sum) / grid.km2


def mean_of(grid, image, lat, lon, valid):
    bins = Bins(grid)
    for s in bands(len(lat)):
        bins.add(lat[s], lon, image[s], valid(image[s]))
    return bins.shaped(np.where(bins.count > 0, bins.sum / np.maximum(bins.count, 1), np.nan))


def lights(grid, people, land):
    """Mean radiance, nW/(cm² sr), from lights.py's tiles, times 10, less the
    sky's own glow: at 55-72°N even land where nobody lives reads about 0.4
    (the aurora, which the annual composite doesn't wholly remove), so each
    1° band of latitude loses what 90% of its uninhabited land stays under."""
    n = grid.width * grid.height
    sums, counts = np.zeros(n), np.zeros(n)
    for path in glob.glob(os.path.join(HERE, 'cache', 'vnp46', '*.npz')):
        z = np.load(path)
        np.add.at(sums, z['cells'], z['sums'])
        np.add.at(counts, z['cells'], z['counts'])
    radiance = np.where(counts > 0, sums / np.maximum(counts, 1), 0).reshape(grid.height, grid.width)
    xs = -grid.x_max + (np.arange(grid.width) + 0.5) * grid.cell
    ys = grid.y_max - (np.arange(grid.height) + 0.5) * grid.cell
    _, lat = inverse(*np.meshgrid(xs, ys))
    band = np.floor(lat).astype(int)
    empty = land & (people == 0)
    sky = np.zeros_like(radiance)
    for b in np.unique(band[empty]):
        m = band == b
        sky[m] = np.percentile(radiance[m & empty], 90)
    return np.maximum(radiance - sky, 0) * 10


def travel(grid):
    image, lat, lon = tiff('travel_time_to_cities_11.tif')
    return mean_of(grid, image, lat, lon, lambda v: v != 65535)


def rain():
    """mm over the year, on ERA5-Land's 0.1° grid."""
    import eccodes
    if not glob.glob(os.path.join(SOURCES, 'era5land_precip_*.grib')):
        import cdsapi
        client = cdsapi.Client(quiet=True, progress=False)
        for year, months in [('2025', ['11', '12']), ('2026', [f'{m:02d}' for m in range(1, 11)])]:
            client.retrieve('reanalysis-era5-land-monthly-means', {
                'product_type': ['monthly_averaged_reanalysis'], 'variable': ['total_precipitation'],
                'year': [year], 'month': months, 'time': ['00:00'],
                'data_format': 'grib', 'download_format': 'unarchived',
            }, os.path.join(SOURCES, f'era5land_precip_{year}.grib'))
    total = np.zeros(NI * NJ)
    for path in sorted(glob.glob(os.path.join(SOURCES, 'era5land_precip_*.grib'))):
        with open(path, 'rb') as f:
            while (gid := eccodes.codes_grib_new_from_file(f)) is not None:
                when = eccodes.codes_get(gid, 'dataDate')
                values = eccodes.codes_get_values(gid)
                eccodes.codes_release(gid)
                days = calendar.monthrange(when // 10000, when // 100 % 100)[1]
                total += np.where(values == MISSING, 0, values) * days * 1000  # m/day -> mm
    return total.reshape(NJ, NI)


# --- output ------------------------------------------------------------------

def write(name, values, land, width, unit, note, step=1):
    """Rounds to `step` (which compresses far better) and saves."""
    v = np.round(np.nan_to_num(values) / step) * step
    v = np.clip(v, 0, NO_DATA - 1).astype(np.uint16)
    v = np.where(land, v, NO_DATA)
    rgb = np.zeros(v.shape + (3,), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 255
    path = os.path.join(DATA_DIR, f'{name}.png')
    Image.fromarray(rgb).save(path, optimize=True)
    shown = v[land]
    print(f'{name}: {v.shape[1]}x{v.shape[0]}, land median {np.median(shown):.0f} {unit}, '
          f'99th {np.percentile(shown, 99):.0f}, max {shown.max()}, {os.path.getsize(path) / 1e6:.1f} MB')
    return {'width': width, 'height': int(v.shape[0]), 'unit': unit, 'note': note, 'max': int(shown.max())}


def main():
    wanted = sys.argv[1:] or ['elevation', 'population', 'lights', 'travel', 'rain']
    info_path = os.path.join(DATA_DIR, 'layers.json')
    info = {'encoding': {'noData': NO_DATA, 'bytes': 'R high, G low'}, 'layers': {}}
    if os.path.exists(info_path):
        info['layers'] = json.load(open(info_path))['layers']

    grid = Grid(FINE)
    print('elevation and the land mask')
    heights, land = elevation(grid)
    cache = {}

    def people():
        if 'people' not in cache:
            cache['people'] = population(grid)
        return cache['people']
    fine = {
        'elevation': (lambda: heights, 'm', 'highest point, to 10 m', 10),
        # Halved, since the densest cells (108,000 people/km²) don't fit 16 bits.
        'population': (lambda: people() / 2, 'people per ½ km²', 'people/km² halved', 1),
        'lights': (lambda: lights(grid, people(), land), 'nW/(cm² sr)×10', 'VNP46A4 2023 radiance times 10', 1),
        'travel': (lambda: travel(grid), 'minutes', 'to 5 minutes', 5),
    }
    for name in wanted:
        if name in fine:
            make, unit, note, step = fine[name]
            info['layers'][name] = write(name, make(), land, FINE, unit, note, step)
    if 'rain' in wanted:
        row, col, on_land, _, _ = equal_earth(era5_land())
        info['layers']['rain'] = write('rain', rain()[row, col], on_land, NI, 'mm', '')
    with open(info_path, 'w') as f:
        json.dump(info, f, indent=2)


if __name__ == '__main__':
    main()
