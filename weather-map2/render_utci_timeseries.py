"""
Render an hourly ERA5-HEAT UTCI time series (from fetch_utci_point.py) as a
wide chart, with the background shaded by the same thermal-stress bands used
on the map.

USAGE:
  python render_utci_timeseries.py hazelwood.csv --title "Hazelwood, MO" --out hazelwood_utci.png
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import numpy as np

from colormap import BAND_EDGES, BAND_COLORS, STRESS_CATEGORIES


def load(path: Path) -> tuple[np.ndarray, np.ndarray]:
    times, values = [], []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            times.append(dt.datetime.fromisoformat(row["timestamp_utc"]))
            values.append(float(row["utci_c"]) if row["utci_c"] else np.nan)
    return np.array(times), np.array(values, dtype=np.float64)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("csv_path", type=Path)
    ap.add_argument("--title", default="")
    ap.add_argument("--tz", default="America/Chicago")
    ap.add_argument("--out", type=Path, default=Path("utci_timeseries.png"))
    ap.add_argument("--width", type=float, default=48.0, help="figure width, inches")
    ap.add_argument("--height", type=float, default=10.0, help="figure height, inches")
    ap.add_argument("--dpi", type=int, default=150)
    args = ap.parse_args()

    times_utc, values = load(args.csv_path)
    tz = ZoneInfo(args.tz)
    times = np.array(
        [t.replace(tzinfo=dt.timezone.utc).astimezone(tz) for t in times_utc]
    )

    finite = np.isfinite(values)
    print(
        f"{len(values)} hourly points, {finite.sum()} valid, "
        f"{times[0]} .. {times[-1]} ({args.tz})"
    )
    print(f"UTCI range {np.nanmin(values):.1f}..{np.nanmax(values):.1f} C")

    fig, ax = plt.subplots(figsize=(args.width, args.height), dpi=args.dpi)
    fig.patch.set_facecolor("#0e0e12")
    ax.set_facecolor("#0e0e12")

    # Background bands: one filled span per official stress category, clipped
    # to the data's own range so the chart doesn't waste vertical space on
    # bands nothing in the series ever reaches.
    lo_data = np.nanmin(values) - 2
    hi_data = np.nanmax(values) + 2
    for lo, hi, label in STRESS_CATEGORIES:
        band_lo, band_hi = max(lo, lo_data), min(hi, hi_data)
        if band_hi <= band_lo:
            continue
        mid = np.clip((band_lo + band_hi) / 2, BAND_EDGES[0], BAND_EDGES[-1])
        color = np.interp(mid, BAND_EDGES, np.arange(len(BAND_EDGES)))
        idx = int(np.clip(color, 0, len(BAND_COLORS) - 1))
        rgb = BAND_COLORS[idx] / 255.0
        ax.axhspan(band_lo, band_hi, color=rgb, alpha=0.22, zorder=0)
        if band_hi - band_lo > 1.5:
            ax.text(
                times[-1], (band_lo + band_hi) / 2, f"  {label}",
                color=(*rgb, 0.9), fontsize=9, va="center", ha="left",
                clip_on=False,
            )

    ax.plot(times, values, color="#f0f0f5", linewidth=0.8, zorder=3)

    ax.xaxis.set_major_locator(mdates.DayLocator(interval=3))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d", tz=tz))
    ax.xaxis.set_minor_locator(mdates.DayLocator())
    ax.set_xlim(times[0], times[-1])
    ax.set_ylim(lo_data, hi_data)

    for spine in ax.spines.values():
        spine.set_color("#3a3a42")
    ax.tick_params(colors="#c8c8d0", labelsize=9)
    ax.grid(True, which="major", axis="x", color="#3a3a42", linewidth=0.5, alpha=0.6)
    ax.grid(True, which="major", axis="y", color="#3a3a42", linewidth=0.5, alpha=0.3)

    ax.set_ylabel("UTCI (°C)", color="#e0e0e5")
    title = f"UTCI, hourly — {args.title}" if args.title else "UTCI, hourly"
    ax.set_title(
        f"{title}\n{times[0].date()} to {times[-1].date()} "
        f"({args.tz}) · ERA5-HEAT intermediate dataset",
        color="#f0f0f5", fontsize=13, loc="left",
    )

    fig.tight_layout()
    fig.savefig(args.out, facecolor=fig.get_facecolor())
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
