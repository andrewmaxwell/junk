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
  household   CORESIDENCE (Galeano et al. 2024) and UN DESA Household Size
              and Composition 2026: people per household times 100, by
              region (census tract in the US, from the ACS 2020-2024), where
              at least 1 person per km² lives (0 elsewhere, 1 where no
              source covers).

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


def un_household_sizes():
    """{ISO3: (year, people per household)}, each country's latest in the UN
    DESA Database on Household Size and Composition."""
    import openpyxl
    book = openpyxl.load_workbook(os.path.join(SOURCES, 'UNDESA_PD_2026_hh-size-composition.xlsx'), read_only=True)
    out = {}
    for row in book['HH size and composition 2026'].iter_rows(min_row=6, values_only=True):
        try:
            iso, year, size = row[2], int(str(row[8])[:4]), float(row[10])
        except (TypeError, ValueError):
            continue
        # Pakistan's 2017 census reads 0.81 in this edition, a slip.
        if iso and 1.5 <= size <= 15 and year >= out.get(iso, (0,))[0]:
            out[iso] = (year, size)
    return out


def household(grid, people, land):
    """People per household, times 100, by region: each region's figure from
    the latest CORESIDENCE census or survey that has it, scaled by how much
    its country's average has changed since (to the UN's latest national
    figure, where that's newer). Countries the harmonized regions don't cover
    take the UN's national figure, on Natural Earth's outlines where
    CORESIDENCE has none; Saudi Arabia, Taiwan and the UAE, with neither,
    have none. The US and Puerto Rico come from census tracts instead (see
    us_tracts). 0 where fewer than 1 person per km² lives, 1 on land no
    source covers."""
    import csv
    import sqlite3
    un = un_household_sizes()
    national = {r['S1']: float(r['HS17']) for r in csv.DictReader(open(os.path.join(SOURCES, 'A0_CORESIDENCE_NATIONAL_DATASET_2024.csv'))) if r['HS17'] not in ('', 'NA')}
    latest = {}  # region code: (year, sample, value)
    for r in csv.DictReader(open(os.path.join(SOURCES, 'A2_CORESIDENCE_SUBNATIONAL_HARMONIZED_DATASET_2024.csv'))):
        if r['HS17'] in ('', 'NA'):
            continue
        year = int(r['T1'])
        if year >= latest.get(r['C5'], (0,))[0]:
            latest[r['C5']] = (year, r['S1'], float(r['HS17']))
    shapes = gpkg_polygons(os.path.join(SOURCES, 'SUBNATIONAL_BOUNDARIES_CORESIDENCE_PROJECT.gpkg'),
                           'a1_world_subnational_coresidence_new', 'GEOLEVEL1')
    codes = list(shapes)
    db = sqlite3.connect(os.path.join(SOURCES, 'SUBNATIONAL_BOUNDARIES_CORESIDENCE_PROJECT.gpkg'))
    db_country = dict(db.execute('select GEOLEVEL1, C1 from a1_world_subnational_coresidence_new'))
    fix = {'URU': 'URY'}
    values = []
    for code in codes:
        iso = fix.get(db_country[code], db_country[code])
        if code in latest:
            year, sample, v = latest[code]
            if iso in un and un[iso][0] > year and sample in national:
                v *= un[iso][1] / national[sample]
        else:
            v = un.get(iso, (0, np.nan))[1]
        values.append(v)
    values = np.array(values + [np.nan])  # the last for cells in no region
    region = spread(rasterize(grid, [shapes[c] for c in codes]), land, 2)
    region_iso = np.array([fix.get(db_country[c], db_country[c]) for c in codes] + [''])[region]
    # Under the regions, every country with a UN figure, for the places
    # CORESIDENCE has no outline for (Singapore, Hong Kong, small islands).
    countries = json.load(open(os.path.join(SOURCES, 'ne_10m_admin_0_countries.geojson')))['features']
    # CORESIDENCE's outlines are generalized: Malaysia's covers Singapore and
    # China's Taiwan, so a region counts only inside its own country.
    outlines, sizes, isos = [], [], []
    for f in countries:
        p = f['properties']
        iso = p['ISO_A3'] if p['ISO_A3'] != '-99' else p['ADM0_A3']
        iso = {'SOL': 'SOM', 'CYN': 'CYP', 'KAB': 'KAZ', 'KAS': 'IND'}.get(iso, iso)  # disputed or leased land
        g = f['geometry']
        polygons = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        outlines.append([np.array(poly[0]) for poly in polygons])
        sizes.append(un.get(iso, (0, np.nan))[1])
        isos.append(iso)
    country = spread(rasterize(grid, outlines), land, 6)
    country_iso = np.array(isos + [''])[country]
    out = values[region]
    out = np.where((country_iso == '') | (country_iso == region_iso), out, np.nan)
    out = np.where(np.isnan(out), np.array(sizes + [np.nan])[country], out)
    # The US and Puerto Rico by census tract, far finer than their states.
    tract = us_tracts(grid)
    out = np.where(np.isin(country_iso, ['USA', 'PRI']) & ~np.isnan(tract), tract, out)
    out = np.where(np.isnan(out), 0.01, out)  # stored as 1: no data
    return np.where(people >= 1, out * 100, 0)


# --- regions -----------------------------------------------------------------

def gpkg_polygons(path, table, key):
    """{key value: [ring, ...]} for a GeoPackage table of (multi)polygons in
    longitude and latitude, outer rings only (each ring an (n, 2) array)."""
    import sqlite3
    import struct
    db = sqlite3.connect(path)
    geom = db.execute('select column_name from gpkg_geometry_columns where table_name = ?', (table,)).fetchone()[0]
    out = {}
    for k, blob in db.execute(f'select "{key}", "{geom}" from "{table}"'):
        if blob is None:
            continue
        # GeoPackage header: "GP", version, flags (bit 0 byte order, bits 1-3
        # envelope kind), srs id, envelope; then plain WKB.
        flags = blob[3]
        envelope = [0, 32, 48, 48, 64][(flags >> 1) & 7]
        wkb = memoryview(blob)[8 + envelope:]
        rings = []

        def read(at):
            order = '<' if wkb[at] == 1 else '>'
            kind = struct.unpack_from(order + 'I', wkb, at + 1)[0]
            dims = 2 + (kind // 1000 in (1, 2)) + 2 * (kind // 1000 == 3) + bool(kind & 0x80000000) + bool(kind & 0x40000000)
            kind = (kind & 0xFFFF) % 1000
            at += 5
            if kind == 3:  # polygon
                count = struct.unpack_from(order + 'I', wkb, at)[0]
                at += 4
                for i in range(count):
                    n = struct.unpack_from(order + 'I', wkb, at)[0]
                    at += 4
                    ring = np.frombuffer(wkb, np.dtype(order + 'f8'), n * dims, at).reshape(n, dims)[:, :2]
                    at += 8 * n * dims
                    if i == 0:
                        rings.append(ring)
            elif kind == 6:  # multipolygon
                count = struct.unpack_from(order + 'I', wkb, at)[0]
                at += 4
                for _ in range(count):
                    at = read(at)
            else:
                raise ValueError(f'geometry type {kind} in {table}')
            return at

        read(0)
        out.setdefault(k, []).extend(rings)
    return out


def rasterize(grid, regions, scale=1, box=None):
    """Each cell's region (an index into `regions`, a list of ring lists),
    -1 where there's none. Bigger regions are drawn first, so one inside
    another (Berlin in Brandenburg, Lesotho in South Africa) stays on top;
    holes are ignored for the same reason. With `scale` and `box` (first
    row, first column, rows, columns, in cells), just that part of the
    grid, `scale` pixels to a cell each way."""
    from PIL import ImageDraw
    row0, col0, rows, cols = box or (0, 0, grid.height, grid.width)
    image = Image.new('I', (cols * scale, rows * scale), 0)
    draw = ImageDraw.Draw(image)

    def area(rings):
        return sum(abs(np.dot(r[:-1, 0], r[1:, 1]) - np.dot(r[1:, 0], r[:-1, 1])) for r in rings)

    for i in sorted(range(len(regions)), key=lambda i: -area(regions[i])):
        for ring in regions[i]:
            x, y = forward(ring[:, 0], np.clip(ring[:, 1], -89.9, 89.9))
            col = ((x + grid.x_max) / grid.cell - col0) * scale
            row = ((grid.y_max - y) / grid.cell - row0) * scale
            if len(ring) >= 3:
                draw.polygon(list(zip(col.tolist(), row.tolist())), fill=i + 1)
    return np.asarray(image, np.int64).reshape(rows * scale, cols * scale) - 1


def shapefile(path):
    """[(record, [outer ring, ...])] from a polygon shapefile in longitude and
    latitude: each record's attributes as a dict, and the rings that wind
    clockwise (the outer ones; holes wind the other way)."""
    import struct
    shp = open(path + '.shp', 'rb').read()
    dbf = open(path + '.dbf', 'rb').read()
    count, header, size = struct.unpack_from('<IHH', dbf, 4)
    fields, at = [], 32
    while dbf[at] != 0x0D:
        name = dbf[at:at + 11].split(b'\0')[0].decode()
        fields.append((name, dbf[at + 16]))
        at += 32
    records = []
    for i in range(count):
        at = header + i * size + 1
        record = {}
        for name, width in fields:
            record[name] = dbf[at:at + width].decode('latin-1').strip()
            at += width
        records.append(record)
    out, at = [], 100
    for record in records:
        _, words = struct.unpack_from('>II', shp, at)
        kind = struct.unpack_from('<i', shp, at + 8)[0]
        rings = []
        if kind == 5:
            parts, points = struct.unpack_from('<ii', shp, at + 44)
            starts = list(struct.unpack_from(f'<{parts}i', shp, at + 52)) + [points]
            xy = np.frombuffer(shp, '<f8', points * 2, at + 52 + 4 * parts).reshape(points, 2)
            for a, b in zip(starts, starts[1:]):
                r = xy[a:b]
                if np.dot(r[:-1, 0], r[1:, 1]) - np.dot(r[1:, 0], r[:-1, 1]) < 0:
                    rings.append(r)
        out.append((record, rings))
        at += 8 + 2 * words
    return out


def us_tracts(grid):
    """People per household in each cell from the ACS 2020-2024 tract
    figures, NaN where no tract has households. A tract's households are
    spread evenly over its area, drawn 6 pixels to a cell each way, so a cell
    is its tracts' people over their households; a tract too small to cover
    a pixel puts all of them in the cell at its middle."""
    import csv

    def table(name, column):
        with open(os.path.join(SOURCES, f'acsdt5y2024-{name}.dat')) as f:
            return {r['GEO_ID'][9:]: float(r[column]) for r in csv.DictReader(f, delimiter='|')
                    if r['GEO_ID'].startswith('1400000US') and r[column] not in ('', 'null')}

    size = table('b25010', 'B25010_E001')
    households = table('b25003', 'B25003_E001')
    tracts = [(r['GEOID'], rings) for r, rings in shapefile(os.path.join(SOURCES, 'cb_2024_us_tract_500k', 'cb_2024_us_tract_500k'))
              if rings and households.get(r['GEOID'], 0) > 0 and size.get(r['GEOID'], -1) > 0]
    hh = np.array([households[g] for g, _ in tracts])
    people = hh * np.array([size[g] for g, _ in tracts])
    n = grid.width * grid.height
    cell_people, cell_hh = np.zeros(n), np.zeros(n)
    scale = 6
    # Drawn in a few boxes (the lower 48 and Puerto Rico, Alaska each side of
    # the date line, Hawaii) rather than the whole grid six times over.
    def where(rings):
        r = np.concatenate(rings)
        x, y = forward(r[:, 0], np.clip(r[:, 1], -89.9, 89.9))
        return (x + grid.x_max) / grid.cell, (grid.y_max - y) / grid.cell

    spots = [where(rings) for _, rings in tracts]
    group = np.array([(g[:2] if g[:2] in ('02', '15') else 'rest') + ('+' if rings[0][0, 0] > 0 else '')
                      for g, rings in tracts])
    pixels = np.zeros(len(tracts))
    drawn = []
    for key in np.unique(group):
        members = np.flatnonzero(group == key)
        cols = np.concatenate([spots[i][0] for i in members])
        rows = np.concatenate([spots[i][1] for i in members])
        row0, col0 = int(rows.min()), int(cols.min())
        box = (row0, col0, int(rows.max()) - row0 + 2, int(cols.max()) - col0 + 2)
        index = rasterize(grid, [tracts[i][1] for i in members], scale, box)
        ok = index >= 0
        rr, cc = np.nonzero(ok)
        t = members[index[ok]]
        cell = (row0 + rr // scale) * grid.width + col0 + cc // scale
        pixels += np.bincount(t, minlength=len(tracts))
        drawn.append((t, cell))
    for t, cell in drawn:
        share = 1 / pixels[t]
        cell_people += np.bincount(cell, people[t] * share, n)
        cell_hh += np.bincount(cell, hh[t] * share, n)
    for i in np.flatnonzero(pixels == 0):
        col, row = spots[i][0].mean(), spots[i][1].mean()
        cell = int(row) * grid.width + int(col)
        cell_people[cell] += people[i]
        cell_hh[cell] += hh[i]
    print(f'  {len(tracts)} tracts, {np.sum(pixels == 0)} too small to draw, {hh.sum() / 1e6:.1f} M households, '
          f'{people.sum() / hh.sum():.2f} people each')
    out = np.where(cell_hh > 0, cell_people / np.maximum(cell_hh, 1e-9), np.nan)
    return out.reshape(grid.height, grid.width)


def spread(index, land, steps):
    """Fills land cells just outside every region (coastlines drawn a little
    differently) from their neighbours, up to `steps` cells out."""
    index = index.copy()
    for _ in range(steps):
        gap = land & (index < 0)
        if not gap.any():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            near = np.roll(np.roll(index, dy, 0), dx, 1)
            take = gap & (near >= 0)
            index[take] = near[take]
            gap &= ~take
    return index


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
    wanted = sys.argv[1:] or ['elevation', 'population', 'lights', 'travel', 'rain', 'household']
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
        'household': (lambda: household(grid, people(), land), 'people ×100', 'people per household times 100', 1),
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
