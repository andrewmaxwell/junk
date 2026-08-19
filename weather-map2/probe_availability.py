"""
Find the newest date the consolidated UTCI product actually has.

The CDS gives no availability endpoint, and asking for a date past the end of
the consolidated record returns a short ZIP rather than an error. So: request a
whole month at a 1-degree area (a few kB) and read the filenames back. One
queue wait per month tells you every available day in that month.

  python probe_availability.py 2026-06 2026-07
"""

from __future__ import annotations

import argparse
import calendar
import re
import zipfile
from pathlib import Path

DATASET = "derived-utci-historical"
TINY_AREA = [1.0, 0.0, 0.0, 1.0]  # north, west, south, east


def days_available(year: int, month: int, product: str, tmp: Path) -> list[int]:
    import cdsapi

    tmp.mkdir(parents=True, exist_ok=True)
    target = tmp / f"probe_{year}{month:02d}.zip"

    client = cdsapi.Client()
    client.retrieve(
        DATASET,
        {
            "variable": ["universal_thermal_climate_index"],
            "version": "1_1",
            "product_type": product,
            "year": [str(year)],
            "month": [f"{month:02d}"],
            # Only real days: a request containing e.g. June 31 is rejected
            # outright as "no valid combination", which looks exactly like the
            # month having no data.
            "day": [
                f"{d:02d}"
                for d in range(1, calendar.monthrange(year, month)[1] + 1)
            ],
            "area": TINY_AREA,
        },
        str(target),
    )

    days: list[int] = []
    with zipfile.ZipFile(target) as zf:
        for name in zf.namelist():
            m = re.search(rf"{year}{month:02d}(\d{{2}})", name)
            if m:
                days.append(int(m.group(1)))
    target.unlink()
    return sorted(set(days))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("months", nargs="+", help="YYYY-MM")
    ap.add_argument("--product", default="consolidated_dataset")
    ap.add_argument("--tmp", type=Path, default=Path("probe_tmp"))
    args = ap.parse_args()

    for spec in args.months:
        year, month = (int(x) for x in spec.split("-"))
        try:
            days = days_available(year, month, args.product, args.tmp)
        except Exception as exc:  # noqa: BLE001 - report and keep probing
            print(f"{spec}: FAILED {type(exc).__name__}: {exc}")
            continue
        if days:
            print(f"{spec}: {len(days)} days, {days[0]:02d}..{days[-1]:02d}")
        else:
            print(f"{spec}: no data")


if __name__ == "__main__":
    main()
