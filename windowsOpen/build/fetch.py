"""Counts, for every ERA5-Land cell on Earth, the hours you could have the
windows open over a year.

    .venv/bin/python fetch.py --start 2025-11-01 --end 2026-10-31

ERA5-Land is ECMWF's hourly land reanalysis on a 0.1° grid (about 9 km), from
the Copernicus Climate Data Store. This downloads 2 m temperature, 2 m dew point,
precipitation and 10 m wind in chunks of about eight days, global, three chunks at a
time. Each chunk is reduced to hour counts as soon as it arrives and then
deleted, so the disk only ever holds a few gigabytes of GRIB. The counts go to
cache/chunks/<first day>.npz: per cell, how many hours were open, and of the
rest how many were too cold, too hot, rainy, windy or muggy, in that order of
blame. Night, 10 pm to 7 am local solar time (from longitude, not time zones),
has a lower floor than the day: a cool night is good sleeping air, and a
house's own heat keeps the inside warmer than the outside.
Alongside them, for each hour ('YYYYMMDDHH' UTC in `stamps`), a packed bit per
land cell (in `land` order) saying whether the weather allowed open windows,
so export.py can close the ones where the air was bad (see air.py) without
the weather being downloaded again.
A chunk that is already there is skipped, so a run picks up where it stopped.

ERA5-Land's precipitation is accumulated since 00 UTC (whatever its GRIB step
labels say), so each hour's rain is the difference from the hour before. The
first midnight of a chunk has no hour before it in the file and borrows the
following hour's rain instead: one hour in 192.
"""

import argparse
import os
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNK_DIR = os.path.join(HERE, 'cache', 'chunks')
GRIB_DIR = os.path.join(HERE, 'cache', 'grib')
NI, NJ = 3600, 1801  # ERA5-Land's grid: 0°E eastward, 90°N southward

# The test for an open-window hour.
LOW_C = (62 - 32) / 1.8  # 62°F: any cooler by day and it's too cold to leave open
NIGHT_LOW_C = (55 - 32) / 1.8  # 55°F at night, when cool air is welcome
NIGHT = (22, 7)  # local solar hours: night runs from 10 pm to before 7 am
HIGH_C = (80 - 32) / 1.8  # 80°F: any warmer and you'd rather shut it and cool
DEW_C = (63 - 32) / 1.8  # 63°F dew point: above this it feels muggy
RAIN_M = 0.001  # 1 mm in the hour: more and rain blows in
WIND_MS = 10  # m/s (22 mph) hourly mean at 10 m: more and things blow around

OUTCOMES = ['open', 'cold', 'hot', 'rain', 'wind', 'humid']
VARIABLES = ['2m_temperature', '2m_dewpoint_temperature', 'total_precipitation',
             '10m_u_component_of_wind', '10m_v_component_of_wind']
SHORT_NAMES = {'2t': 't', '2d': 'd', 'tp': 'p', '10u': 'u', '10v': 'v'}
MISSING = 9999  # eccodes' default for points with no value (the sea)

log_lock = threading.Lock()


def log(*args):
    with log_lock:
        print(time.strftime('%H:%M:%S'), *args, flush=True)


def chunks(start, end):
    """Runs of about eight days, never crossing a month."""
    out = []
    day = start
    while day <= end:
        month_end = (day.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        last = min(end, month_end, day + timedelta(days=7))
        if month_end - last < timedelta(days=4):
            last = min(end, month_end)  # don't leave a stub at the end of the month
        out.append((day, last))
        day = last + timedelta(days=1)
    return out


def download(first, last, path):
    import cdsapi
    client = cdsapi.Client(quiet=True, progress=False)
    days = [f'{d:02d}' for d in range(first.day, last.day + 1)]
    client.retrieve('reanalysis-era5-land', {
        'variable': VARIABLES,
        'year': str(first.year),
        'month': f'{first.month:02d}',
        'day': days,
        'time': [f'{h:02d}:00' for h in range(24)],
        'data_format': 'grib',
        'download_format': 'unarchived',
    }, path)


def hours(path):
    """Yields (validity, {'t', 'd', 'p', 'u', 'v'}) for each hour in the file, in order."""
    import eccodes
    pending = {}
    with open(path, 'rb') as f:
        while (gid := eccodes.codes_grib_new_from_file(f)) is not None:
            try:
                key = (eccodes.codes_get(gid, 'validityDate'), eccodes.codes_get(gid, 'validityTime'))
                name = SHORT_NAMES[eccodes.codes_get(gid, 'shortName')]
                assert eccodes.codes_get(gid, 'Ni') == NI and eccodes.codes_get(gid, 'Nj') == NJ
                values = eccodes.codes_get_values(gid).astype(np.float32)
            finally:
                eccodes.codes_release(gid)
            fields = pending.setdefault(key, {})
            fields[name] = values
            if len(fields) == len(SHORT_NAMES):
                yield key, pending.pop(key)
    if pending:
        raise ValueError(f'incomplete hours in {path}: {sorted(pending)}')


def reduce(path):
    counts = np.zeros((len(OUTCOMES), NI * NJ), np.uint16)
    land = None
    previous = {}  # validity -> accumulated precipitation, for the next hour's difference
    later = []  # midnights with no hour before them, done once the next hour is known
    n = 0

    open_hours = {}  # 'YYYYMMDDHH' -> packed bits, one per land cell
    # Each cell's longitude, for its local solar hour.
    lon = np.tile(np.arange(NI, dtype=np.float32) * 0.1, NJ)

    def count(stamp, f, rain):
        t = f['t'] - 273.15
        local = (int(stamp[-2:]) + lon / 15) % 24
        night = (local >= NIGHT[0]) | (local < NIGHT[1])
        cold = t < np.where(night, NIGHT_LOW_C, LOW_C)
        hot = t > HIGH_C
        wet = ~cold & ~hot & (rain >= RAIN_M)
        windy = ~cold & ~hot & ~wet & (np.hypot(f['u'], f['v']) > WIND_MS)
        humid = ~cold & ~hot & ~wet & ~windy & (f['d'] - 273.15 > DEW_C)
        is_open = ~(cold | hot | wet | windy | humid)
        for i, mask in enumerate([is_open, cold, hot, wet, windy, humid]):
            counts[i] += mask & land
        open_hours[stamp] = np.packbits(is_open[land])

    for (vdate, vtime), f in hours(path):
        if land is None:
            land = f['t'] != MISSING
        p = np.where(f['p'] == MISSING, 0, f['p'])
        hour = vtime // 100
        when = date(vdate // 10000, vdate // 100 % 100, vdate % 100)
        stamp = f'{vdate}{hour:02d}'
        if hour == 1:
            rain = p  # the day's accumulation starts over at 00 UTC
        elif hour == 0:
            before = previous.get((when - timedelta(days=1), 23))
            if before is None:
                later.append((stamp, f))
                previous[(when, 0)] = p
                n += 1
                continue
            rain = p - before
        else:
            rain = p - previous[(when, hour - 1)]
        if hour == 1:
            for ls, lf in later:  # borrow this hour's rain
                count(ls, lf, rain)
            later = []
        count(stamp, f, rain)
        previous = {(when, hour): p}
        n += 1
    for ls, lf in later:
        count(ls, lf, np.zeros_like(lf['t']))
    stamps = sorted(open_hours)
    masks = np.stack([open_hours[s] for s in stamps])
    return counts.reshape(len(OUTCOMES), NJ, NI), land.reshape(NJ, NI), n, stamps, masks


def run(first, last):
    out = os.path.join(CHUNK_DIR, f'{first.isoformat()}.npz')
    if os.path.exists(out):
        return
    grib = os.path.join(GRIB_DIR, f'{first.isoformat()}.grib')
    for attempt in range(5):
        try:
            if not os.path.exists(grib):
                log(f'{first} – {last}: requesting')
                started = time.time()
                download(first, last, grib + '.part')
                os.rename(grib + '.part', grib)
                size = os.path.getsize(grib) / 1e9
                log(f'{first} – {last}: downloaded {size:.1f} GB in {(time.time() - started) / 60:.0f} min')
            started = time.time()
            counts, land, n, stamps, masks = reduce(grib)
            expected = ((last - first).days + 1) * 24
            if n != expected:
                raise ValueError(f'{n} hours, expected {expected}')
            np.savez_compressed(out + '.tmp.npz', counts=counts, land=land, hours=n,
                                outcomes=OUTCOMES, first=first.isoformat(), last=last.isoformat(),
                                stamps=np.array(stamps), open_masks=masks)
            os.rename(out + '.tmp.npz', out)
            os.remove(grib)
            log(f'{first} – {last}: counted {n} hours in {time.time() - started:.0f} s')
            return
        except Exception:
            log(f'{first} – {last}: attempt {attempt + 1} failed\n{traceback.format_exc()}')
            for p in (grib, grib + '.part'):
                if os.path.exists(p) and attempt >= 1:
                    os.remove(p)
            time.sleep(60 * (attempt + 1))
    log(f'{first} – {last}: giving up')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--start', required=True)
    parser.add_argument('--end', required=True)
    parser.add_argument('--workers', type=int, default=3)
    args = parser.parse_args()
    os.makedirs(CHUNK_DIR, exist_ok=True)
    os.makedirs(GRIB_DIR, exist_ok=True)
    todo = chunks(date.fromisoformat(args.start), date.fromisoformat(args.end))
    log(f'{len(todo)} chunks')
    with ThreadPoolExecutor(args.workers) as pool:
        list(pool.map(lambda c: run(*c), todo))
    done = len([c for c in todo if os.path.exists(os.path.join(CHUNK_DIR, f'{c[0].isoformat()}.npz'))])
    log(f'done: {done} of {len(todo)} chunks')
    sys.exit(0 if done == len(todo) else 1)


if __name__ == '__main__':
    main()
