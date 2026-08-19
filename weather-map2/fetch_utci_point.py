"""
Download hourly ERA5-HEAT UTCI for a single point over a date range.

Unlike fetch_utci.py (whole-globe fields for the map renderer), this pulls a
tiny area box around one lat/lon and extracts the nearest grid cell, so a
multi-month hourly time series stays a handful of small requests instead of
gigabytes of global grids.

USAGE:
  python fetch_utci_point.py 38.7629 -90.3629 2026-06-12 2026-08-12 --out hazelwood.csv

Always uses product_type=intermediate_dataset: consolidated_dataset lags
2-3 months (see README), so any "recent past" range falls outside it anyway.
Requests are grouped one-per-month, same as fetch_utci.py, since the CDS API
expands year x month x day as a cross product.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import zipfile
from pathlib import Path

import numpy as np
from netCDF4 import Dataset  # type: ignore[import-untyped]

DATASET = "derived-utci-historical"
DATE_RE = re.compile(r"utci_(\d{4})(\d{2})(\d{2})_v1\.1_int")


def month_range(start: dt.date, end: dt.date) -> list[tuple[int, int]]:
    months = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        months.append((y, m))
        m += 1
        if m == 13:
            m = 1
            y += 1
    return months


def fetch_month(
    year: int, month: int, start: dt.date, end: dt.date, lat: float, lon: float,
    tmp_dir: Path,
) -> list[tuple[dt.datetime, float]]:
    import cdsapi

    last_day = (dt.date(year + (month == 12), month % 12 + 1, 1) - dt.timedelta(days=1)).day
    days = [
        d for d in range(1, last_day + 1)
        if start <= dt.date(year, month, d) <= end
    ]
    if not days:
        return []

    box = 0.3  # degrees; wide enough to always straddle the 0.25 deg grid
    area = [lat + box, lon - box, lat - box, lon + box]  # N, W, S, E

    client = cdsapi.Client()
    target = tmp_dir / f"utci_point_{year}{month:02d}.zip"
    print(f"requesting {year}-{month:02d}, {len(days)} day(s) ...")
    client.retrieve(
        DATASET,
        {
            "variable": ["universal_thermal_climate_index"],
            "version": "1_1",
            "product_type": "intermediate_dataset",
            "year": [str(year)],
            "month": [f"{month:02d}"],
            "day": [f"{d:02d}" for d in days],
            "area": area,
        },
        str(target),
    )

    rows: list[tuple[dt.datetime, float]] = []
    with zipfile.ZipFile(target) as zf:
        for name in zf.namelist():
            zf.extract(name, tmp_dir)
            m = DATE_RE.search(name)
            if not m:
                continue
            day = dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            with Dataset(tmp_dir / name) as ds:
                lats = np.asarray(ds.variables["lat"][:])
                lons = np.asarray(ds.variables["lon"][:])
                lat_idx = int(np.argmin(np.abs(lats - lat)))
                lon_idx = int(np.argmin(np.abs(lons - lon)))
                values = np.ma.filled(
                    ds.variables["utci"][:, lat_idx, lon_idx].astype(np.float64),
                    np.nan,
                )
            (tmp_dir / name).unlink()
            for hour, kelvin in enumerate(values):
                celsius = kelvin - 273.15 if np.isfinite(kelvin) else np.nan
                rows.append(
                    (dt.datetime(day.year, day.month, day.day, hour), celsius)
                )
    target.unlink()
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("lat", type=float)
    ap.add_argument("lon", type=float, help="negative for west")
    ap.add_argument("start", help="YYYY-MM-DD")
    ap.add_argument("end", help="YYYY-MM-DD")
    ap.add_argument("--out", type=Path, default=Path("utci_point.csv"))
    ap.add_argument("--tmp", type=Path, default=Path("utci_point_tmp"))
    args = ap.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)
    args.tmp.mkdir(parents=True, exist_ok=True)

    all_rows: list[tuple[dt.datetime, float]] = []
    for year, month in month_range(start, end):
        all_rows.extend(
            fetch_month(year, month, start, end, args.lat, args.lon, args.tmp)
        )
    all_rows.sort(key=lambda r: r[0])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["timestamp_utc", "utci_c"])
        for ts, val in all_rows:
            w.writerow([ts.isoformat(), f"{val:.2f}" if np.isfinite(val) else ""])

    n_valid = sum(1 for _, v in all_rows if np.isfinite(v))
    print(f"wrote {len(all_rows)} hourly rows ({n_valid} valid) to {args.out}")


if __name__ == "__main__":
    main()
