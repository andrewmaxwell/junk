"""
Download hourly global UTCI (ERA5-HEAT) from the Copernicus Climate Data Store.

SETUP (once):
  1. Register at https://cds.climate.copernicus.eu and log in.
  2. Go to https://cds.climate.copernicus.eu/how-to-api and copy the two-line
     block shown there into ~/.cdsapirc. Copy it from that page rather than
     typing it from an example -- the URL changed during the 2024 CDS migration
     and stale ~/.cdsapirc files are the single most common failure.
  3. Open https://cds.climate.copernicus.eu/datasets/derived-utci-historical,
     scroll to the bottom of the Download tab, and ACCEPT THE LICENCE. Requests
     fail with a 403 until you do this manually, once, in the browser.
  4. pip install "cdsapi>=0.7.7" netCDF4 numpy pillow

USAGE:
  python fetch_utci.py 2026-07-15 --out data/

Notes on this dataset:
  - Values are in KELVIN. The renderer converts.
  - Coverage is global EXCEPT ANTARCTICA: 90N to 60S.
  - Resolution 0.25 deg, so a full field is 1440 x 601.
  - The response is a ZIP containing one NetCDF file per requested day.
  - product_type "consolidated_dataset" runs 2-3 months behind real time;
    "intermediate_dataset" is updated daily but is provisional. If you ask for
    a recent date with the consolidated product you'll get an empty result
    rather than a clear error, which is confusing -- hence --product below.
  - Requests are QUEUED. A two-day global request typically takes a few minutes.
"""

from __future__ import annotations

import argparse
import datetime as dt
import zipfile
from pathlib import Path

DATASET = "derived-utci-historical"


def fetch_days(
    days: list[dt.date],
    out_dir: Path,
    product: str = "consolidated_dataset",
    area: list[float] | None = None,
) -> list[Path]:
    """Download UTCI for the given days. Returns paths to extracted .nc files."""
    import cdsapi

    out_dir.mkdir(parents=True, exist_ok=True)

    # One request per month keeps the year/month/day cross-product honest:
    # the API expands year x month x day, so spanning a month boundary in a
    # single request would ask for dates that don't exist.
    by_month: dict[tuple[int, int], list[str]] = {}
    for d in days:
        by_month.setdefault((d.year, d.month), []).append(f"{d.day:02d}")

    client = cdsapi.Client()
    extracted: list[Path] = []

    for (year, month), day_list in sorted(by_month.items()):
        request = {
            "variable": ["universal_thermal_climate_index"],
            "version": "1_1",
            "product_type": product,
            "year": [str(year)],
            "month": [f"{month:02d}"],
            "day": sorted(day_list),
        }
        if area:
            # [north, west, south, east]
            request["area"] = area

        target = out_dir / f"utci_{year}{month:02d}.zip"
        print(f"requesting {year}-{month:02d} days={sorted(day_list)} ...")
        client.retrieve(DATASET, request, str(target))

        with zipfile.ZipFile(target) as zf:
            for name in zf.namelist():
                if name.endswith(".nc"):
                    zf.extract(name, out_dir)
                    extracted.append(out_dir / name)
        target.unlink()

    extracted.sort()
    print(f"extracted {len(extracted)} NetCDF file(s) to {out_dir}")
    return extracted


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("date", help="target date, YYYY-MM-DD")
    ap.add_argument(
        "--out", type=Path, default=Path("data"), help="output directory"
    )
    ap.add_argument(
        "--product",
        default="consolidated_dataset",
        choices=["consolidated_dataset", "intermediate_dataset"],
        help="consolidated lags 2-3 months; intermediate is near real time",
    )
    ap.add_argument(
        "--single-day",
        action="store_true",
        help="fetch only the target day. Default also fetches the following "
        "day, which local-time sampling needs for western longitudes.",
    )
    ap.add_argument(
        "--days",
        type=int,
        help="fetch a run of N days ENDING on the target date, for a "
        "timelapse. Overrides --single-day.",
    )
    args = ap.parse_args()

    day = dt.date.fromisoformat(args.date)
    if args.days:
        days = [
            day - dt.timedelta(days=n) for n in range(args.days - 1, -1, -1)
        ]
    elif args.single_day:
        days = [day]
    else:
        days = [day, day + dt.timedelta(days=1)]
    fetch_days(days, args.out, product=args.product)


if __name__ == "__main__":
    main()
