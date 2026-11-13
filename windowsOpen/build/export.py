"""Turns fetch.py's hour counts into what the page loads.

    .venv/bin/python export.py

Sums cache/chunks/*.npz into the whole year and each calendar month, then
resamples ERA5-Land's 0.1° latitude-longitude grid onto an Equal Earth grid,
so every column the page draws has a square footprint and the same area.
Antarctica is left off.

Writes to ../data/:

  <period>.png, period `all` or `01`-`12`: RGB, one pixel per Equal Earth
  cell, north up:
    R  percent of hours the windows could be open, 0-100: the weather in
       range (fetch.py) and the air clean (air.py)
    G  what closed them most often: index into REASONS, 254 if nothing did
    B  0
  and 255 in R and G off land.

  meta.json: the grid, the periods, the test and the encoding.
"""

import glob
import json
import os
from datetime import date

import numpy as np
from PIL import Image

from air import AIR_DIR, PM10_LIMIT, PM25_LIMIT
from air import NI as AIR_NI
from air import STEP as AIR_STEP
from fetch import CHUNK_DIR, DEW_C, HIGH_C, LOW_C, NI, NIGHT, NIGHT_LOW_C, NJ, OUTCOMES, RAIN_M, WIND_MS

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, '..', 'data')
WIDTH = 3600  # Equal Earth cells across; about ERA5-Land's 11 km at the equator
SOUTH = -58  # degrees; below this is the Southern Ocean and Antarctica
NO_DATA = 255
NO_REASON = 254
REASONS = OUTCOMES[1:] + ['air']

# Equal Earth (Šavrič, Patterson and Jenny 2018), on a unit sphere.
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = np.sqrt(3) / 2


def forward(lon, lat):
    t = np.arcsin(M * np.sin(np.radians(lat)))
    x = 2 * np.sqrt(3) * np.radians(lon) * np.cos(t) / (3 * (9 * A4 * t**8 + 7 * A3 * t**6 + 3 * A2 * t**2 + A1))
    y = A4 * t**9 + A3 * t**7 + A2 * t**3 + A1 * t
    return x, y


def inverse(x, y):
    t = y / A1
    for _ in range(12):  # Newton's method on y(t)
        f = A4 * t**9 + A3 * t**7 + A2 * t**3 + A1 * t - y
        t -= f / (9 * A4 * t**8 + 7 * A3 * t**6 + 3 * A2 * t**2 + A1)
    lon = 3 * x * (9 * A4 * t**8 + 7 * A3 * t**6 + 3 * A2 * t**2 + A1) / (2 * np.sqrt(3) * np.cos(t))
    lat = np.arcsin(np.sin(t) / M)
    return np.degrees(lon), np.degrees(lat)


air_months = {}


def equal_earth(land):
    """The Equal Earth grid, and for each of its cells the ERA5-Land cell under
    its centre: (row, col, on_land, height, (x_max, y_max, cell))."""
    x_max, _ = forward(180, 0)
    _, y_max = forward(0, 90)
    _, y_min = forward(0, SOUTH)
    cell = 2 * x_max / WIDTH
    height = int(np.ceil((y_max - y_min) / cell))
    xs = -x_max + (np.arange(WIDTH) + 0.5) * cell
    ys = y_max - (np.arange(height) + 0.5) * cell
    gx, gy = np.meshgrid(xs, ys)
    lon, lat = inverse(gx, gy)
    inside = np.abs(lon) <= 180
    col = np.round(np.mod(lon, 360) / 0.1).astype(int) % NI
    row = np.clip(np.round((90 - lat) / 0.1).astype(int), 0, NJ - 1)
    return row, col, inside & land[row, col], height, (x_max, y_max, cell)


def bad_air(stamp):
    """The CAMS bad-air bits for an hour, flat, or None if not downloaded."""
    month = f'{stamp[:4]}-{stamp[4:6]}'
    if month not in air_months:
        path = os.path.join(AIR_DIR, f'{month}.npz')
        if os.path.exists(path):
            z = np.load(path)
            air_months[month] = ({s: i for i, s in enumerate(z['stamps'])}, z['bad'])
        else:
            air_months[month] = None
    entry = air_months[month]
    if entry is None or stamp not in entry[0]:
        return None
    return np.unpackbits(entry[1][entry[0][stamp]])


def main():
    files = sorted(glob.glob(os.path.join(CHUNK_DIR, '*.npz')))
    months = {}  # month -> [counts, hours]
    land = None
    first, last = None, None
    air_hours = missing_air = 0
    for path in files:
        z = np.load(path)
        month = int(str(z['first'])[5:7])
        entry = months.setdefault(month, [np.zeros((len(REASONS) + 1, NJ, NI), np.uint32), 0])
        counts = np.zeros((len(REASONS) + 1, NJ * NI), np.uint32)
        counts[:len(OUTCOMES)] = z['counts'].reshape(len(OUTCOMES), -1)
        land = z['land']
        # Each land cell's nearest CAMS cell.
        cells = np.flatnonzero(land.ravel())
        rows, cols = np.divmod(cells, NI)
        nearest = (np.round(rows * 0.1 / AIR_STEP).astype(int) * AIR_NI
                   + np.round(cols * 0.1 / AIR_STEP).astype(int) % AIR_NI)
        # Hours the weather allowed but the air didn't move from open to air.
        closed_by_air = np.zeros(len(cells), np.uint32)
        for stamp, bits in zip(z['stamps'], z['open_masks']):
            bad = bad_air(str(stamp))
            if bad is None:
                missing_air += 1
                continue
            air_hours += 1
            is_open = np.unpackbits(bits)[:len(cells)].astype(bool)
            closed_by_air += is_open & bad[nearest].astype(bool)
        counts[0, cells] -= closed_by_air
        counts[-1, cells] += closed_by_air
        entry[0] += counts.reshape(-1, NJ, NI)
        entry[1] += int(z['hours'])
        first = min(first or str(z['first']), str(z['first']))
        last = max(last or str(z['last']), str(z['last']))
    print(f'{len(files)} chunks, {first} to {last}, months {sorted(months)}; '
          f'air for {air_hours} hours, missing for {missing_air}')

    row, col, on_land, height, (x_max, y_max, cell) = equal_earth(land)

    os.makedirs(DATA_DIR, exist_ok=True)
    periods = {'all': [sum(m[0] for m in months.values()), sum(m[1] for m in months.values())]}
    for month, entry in sorted(months.items()):
        periods[f'{month:02d}'] = entry
    for key, (counts, hours) in periods.items():
        sampled = counts[:, row, col]
        share = np.round(sampled[0] * 100 / hours)
        closed = sampled[1:]
        reason = np.where(closed.sum(0) > 0, closed.argmax(0), NO_REASON)
        rgb = np.zeros((height, WIDTH, 3), np.uint8)
        rgb[..., 0] = np.where(on_land, share, NO_DATA)
        rgb[..., 1] = np.where(on_land, reason, NO_DATA)
        Image.fromarray(rgb).save(os.path.join(DATA_DIR, f'{key}.png'), optimize=True)
        land_share = share[on_land]
        print(f'{key}: {hours} hours, land median {np.median(land_share):.0f}%, '
              f'{os.path.getsize(os.path.join(DATA_DIR, f"{key}.png")) / 1e6:.1f} MB')

    meta = {
        'start': first,
        'end': last,
        'width': WIDTH,
        'height': height,
        'projection': {'name': 'Equal Earth', 'xMax': x_max, 'yMax': y_max, 'cell': cell, 'south': SOUTH},
        'periods': list(periods),
        'reasons': REASONS,
        'test': {
            'lowF': round(LOW_C * 1.8 + 32),
            'nightLowF': round(NIGHT_LOW_C * 1.8 + 32),
            'nightHours': NIGHT,
            'highF': round(HIGH_C * 1.8 + 32),
            'dewF': round(DEW_C * 1.8 + 32),
            'rainMm': RAIN_M * 1000,
            'windMph': round(WIND_MS * 2.23694),
            'pm10': PM10_LIMIT,
            'pm25': PM25_LIMIT,
            'airComplete': missing_air == 0,
        },
        'encoding': {'noData': NO_DATA, 'noReason': NO_REASON},
    }
    with open(os.path.join(DATA_DIR, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)


if __name__ == '__main__':
    main()
