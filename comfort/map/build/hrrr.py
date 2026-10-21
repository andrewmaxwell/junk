"""Downloads HRRR hour by hour and converts each into the app's weather row.

    .venv/bin/python hrrr.py --start 2026-10-13 --end 2026-10-19

For every UTC hour in the range that is a waking hour somewhere in the Lower 48,
writes cache/runs/<start>_<end>/spool/<YYYYMMDDHH>.f32: float32 [field][cell]
in the order of FIELDS, in the app's units, for the cells `grid.py` chose.
`score.js` consumes them in order and deletes them once checkpointed, so the
spool is capped and this waits when it is full. Run both at once.
"""

import argparse
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import numpy as np

from cams import CamsMonth
from hrrr_common import CACHE_DIR, fetch_fields, hrrr_file, load_grid

SPOOL_LIMIT = 48  # hours on disk at once, ~2.4 GB
WORKERS = 6
WAKING_START_HOUR, WAKING_END_HOUR = 6, 22  # must match common.js

# The row `comfort.js` scores, in file order. `score.js` reads this order.
FIELDS = [
    'temperature_2m',
    'dew_point_2m',
    'wind_speed_10m',
    'wind_gusts_10m',
    'cloud_cover',
    'shortwave_radiation',
    'direct_radiation',
    'diffuse_radiation',
    'direct_normal_irradiance',
    'soil_temperature_0cm',
    'precipitation',
    'weather_code',
    'is_day',
    'uv_index',
    'us_aqi',
]

HRRR_FIELDS = [
    'TMP:2 m above ground',
    'DPT:2 m above ground',
    'UGRD:10 m above ground',
    'VGRD:10 m above ground',
    'GUST:surface',
    'TCDC:entire atmosphere',
    'DSWRF:surface',
    'VBDSF:surface',
    'VDDSF:surface',
    'TMP:surface',
    'APCP:surface',
    'CRAIN:surface',
    'CSNOW:surface',
    'CFRZR:surface',
    'CICEP:surface',
    'LTNG:entire atmosphere',
]

MS_TO_MPH = 2.236936
# HRRR's lightning threat, in flashes per km² per 5 minutes. Above this a cell
# is having a thunderstorm in the sense the app's hazard means: lightning
# close enough to matter, not a flash on the horizon.
LIGHTNING_THRESHOLD = 0.02

k_to_f = lambda k: (k - 273.15) * 1.8 + 32


def solar_elevation(when, lat, lon):
    """Degrees above the horizon (NOAA's low-precision formulae)."""
    day = when.timetuple().tm_yday
    hour = when.hour + when.minute / 60
    gamma = 2 * np.pi / 365 * (day - 1 + (hour - 12) / 24)
    decl = (0.006918 - 0.399912 * np.cos(gamma) + 0.070257 * np.sin(gamma)
            - 0.006758 * np.cos(2 * gamma) + 0.000907 * np.sin(2 * gamma)
            - 0.002697 * np.cos(3 * gamma) + 0.00148 * np.sin(3 * gamma))
    eqtime = 229.18 * (0.000075 + 0.001868 * np.cos(gamma) - 0.032077 * np.sin(gamma)
                       - 0.014615 * np.cos(2 * gamma) - 0.040849 * np.sin(2 * gamma))
    solar_minutes = hour * 60 + eqtime + 4 * lon
    hour_angle = np.radians(solar_minutes / 4 - 180)
    lat_r = np.radians(lat)
    sin_elev = (np.sin(lat_r) * np.sin(decl)
                + np.cos(lat_r) * np.cos(decl) * np.cos(hour_angle))
    return np.degrees(np.arcsin(np.clip(sin_elev, -1, 1)))


def weather_code(raw, precip, cloud):
    """The WMO codes the comfort model distinguishes: thunderstorm, freezing
    rain, snow, ice pellets, rain by intensity, otherwise sky cover."""
    code = np.select(
        [cloud < 20, cloud < 50, cloud < 80], [0, 1, 2], default=3
    ).astype(np.float32)
    wet = precip > 0.1
    code = np.where(wet, np.select([precip < 2.5, precip < 7.6], [61, 63], 65), code)
    code = np.where(wet & (raw['CICEP:surface'] > 0), 77, code)
    code = np.where(wet & (raw['CSNOW:surface'] > 0), np.where(precip < 1, 71, 73), code)
    code = np.where(wet & (raw['CFRZR:surface'] > 0), np.where(precip < 1, 66, 67), code)
    return np.where(raw['LTNG:entire atmosphere'] >= LIGHTNING_THRESHOLD, 95, code)


def convert(raw, cells, lat, lon, when, cams):
    raw = {k: v[cells] for k, v in raw.items()}
    precip = raw['APCP:surface']
    cloud = raw['TCDC:entire atmosphere']
    shortwave = np.maximum(raw['DSWRF:surface'], 0)
    beam, diffuse_vis = raw['VBDSF:surface'], raw['VDDSF:surface']
    # HRRR splits only the visible band into beam and diffuse; its ratio is
    # the best available estimate of the split for the whole spectrum.
    visible = beam + diffuse_vis
    beam_fraction = np.where(visible > 1, beam / np.maximum(visible, 1e-6), 0)
    direct = shortwave * beam_fraction
    elevation = solar_elevation(when, lat, lon)
    sin_elev = np.sin(np.radians(np.maximum(elevation, 0)))
    # Normal-incidence beam from the horizontal one, left at zero when the sun
    # is too low for the division to mean anything.
    dni = np.where(elevation > 2, np.minimum(direct / np.maximum(sin_elev, 1e-3), 1100), 0)

    uv, aqi = cams.at(when) if cams else (None, None)
    nan = np.full(len(cells), np.nan, np.float32)
    columns = {
        'temperature_2m': k_to_f(raw['TMP:2 m above ground']),
        'dew_point_2m': k_to_f(raw['DPT:2 m above ground']),
        'wind_speed_10m': np.hypot(raw['UGRD:10 m above ground'],
                                   raw['VGRD:10 m above ground']) * MS_TO_MPH,
        'wind_gusts_10m': raw['GUST:surface'] * MS_TO_MPH,
        'cloud_cover': cloud,
        'shortwave_radiation': shortwave,
        'direct_radiation': direct,
        'diffuse_radiation': shortwave - direct,
        'direct_normal_irradiance': dni,
        'soil_temperature_0cm': k_to_f(raw['TMP:surface']),
        'precipitation': precip,
        'weather_code': weather_code(raw, precip, cloud),
        'is_day': (elevation > 0).astype(np.float32),
        'uv_index': nan if uv is None else uv,
        'us_aqi': nan if aqi is None else aqi,
    }
    return np.stack([columns[f].astype(np.float32) for f in FIELDS])


def wanted(when, zones, first_day, last_day):
    """Whether any zone is in its waking hours, on a local date in the range."""
    for zone in zones:
        local = when.astimezone(ZoneInfo(zone))
        if (WAKING_START_HOUR <= local.hour < WAKING_END_HOUR
                and first_day <= local.date() <= last_day):
            return True
    return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    args = parser.parse_args()

    grid = load_grid()
    cells, lat, lon = grid['cells'], grid['lat'], grid['lon']
    run_dir = os.path.join(CACHE_DIR, 'runs', f'{args.start}_{args.end}')
    spool_dir = os.path.join(run_dir, 'spool')
    os.makedirs(spool_dir, exist_ok=True)
    with open(os.path.join(run_dir, 'fields.json'), 'w') as f:
        json.dump(FIELDS, f)

    start = datetime.fromisoformat(args.start).replace(tzinfo=timezone.utc)
    end = datetime.fromisoformat(args.end).replace(tzinfo=timezone.utc) + timedelta(days=1)
    # Local days start up to eight hours after UTC ones, so the range runs
    # that much past the last UTC midnight. `score.js` applies the same test.
    hours = []
    when = start
    while when < end + timedelta(hours=8):
        if wanted(when, grid['zones'], start.date(), end.date() - timedelta(days=1)):
            hours.append(when)
        when += timedelta(hours=1)

    # Hours the scorer has checkpointed; anything else is still needed.
    done_path = os.path.join(run_dir, 'scored.txt')
    cams_cache = {}

    def produce(when):
        name = f'{when:%Y%m%d%H}'
        path = os.path.join(spool_dir, name + '.f32')
        if os.path.exists(path) or os.path.exists(path[:-4] + '.done'):
            return
        scored = open(done_path).read().split() if os.path.exists(done_path) else []
        if name in scored:
            return
        # Wait for room, unless this is earlier than everything spooled: the
        # scorer works in order, so that hour is the one it is waiting for.
        while True:
            spooled = [f[:-4] for f in os.listdir(spool_dir) if f.endswith('.f32')]
            if len(spooled) < SPOOL_LIMIT or name < min(spooled):
                break
            time.sleep(2)
        # The run one hour earlier, one hour in: an hour of accumulated
        # precipitation ending at `when`, which is what the app's rows hold.
        raw = fetch_fields(hrrr_file(when - timedelta(hours=1)), HRRR_FIELDS)
        month = f'{when:%Y-%m}'
        if month not in cams_cache:
            cams_cache[month] = CamsMonth.load(month, lat, lon)
        rows = convert(raw, cells, lat, lon, when, cams_cache[month])
        rows.tofile(path + '.part')
        os.replace(path + '.part', path)

    print(f'{len(hours)} hours to fetch', flush=True)
    started = time.time()
    with ThreadPoolExecutor(WORKERS) as pool:
        for n, _ in enumerate(pool.map(produce, hours), 1):
            if n % 10 == 0 or n == len(hours):
                print(f'{n}/{len(hours)} hours, {time.time() - started:.0f}s', flush=True)


if __name__ == '__main__':
    main()
