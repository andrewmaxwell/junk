"""
Render an ERA5-HEAT UTCI field to an equirectangular PNG.

  python render_utci.py data/*.nc --mode local --out utci_local15.png

MODES
  local  For every pixel, take the hour nearest a fixed LOCAL clock time
         (default 15:00). This is the one you want. Every pixel then answers
         the same question -- "how did it feel there mid-afternoon" -- instead
         of "how did it feel everywhere at 18:00 UTC", and the day/night
         terminator that would otherwise cut a curved seam across the map
         disappears entirely.
  mean   24-hour mean of the target day. Smooths day and night together into
         the overall character of the day.
  max    24-hour maximum. The worst of the afternoon.
  hour   A single UTC hour, if you actually want the terminator.

Local sampling needs the following day's early hours for western longitudes
(15:00 local at UTC-12 is 03:00 UTC the NEXT day), which is why fetch_utci.py
grabs two days by default. With only one day it wraps within the same day and
warns.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from netCDF4 import Dataset  # type: ignore[import-untyped]
from PIL import Image, ImageDraw

from colormap import colorize, legend_strip, legend_ticks

# Candidate names, because CDS has renamed coordinates across versions.
UTCI_NAMES = ("utci", "universal_thermal_climate_index", "UTCI")
LAT_NAMES = ("latitude", "lat")
LON_NAMES = ("longitude", "lon")
TIME_NAMES = ("time", "valid_time")


def _pick(ds: Dataset, candidates: tuple[str, ...], kind: str) -> str:
    for name in candidates:
        if name in ds.variables:
            return name
    raise KeyError(
        f"no {kind} variable found; file has {sorted(ds.variables)}"
    )


def load_stack(paths: list[Path]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Concatenate files along time. Returns (utci_celsius, lats, lons)."""
    fields: list[np.ndarray] = []
    lats = lons = None

    for path in sorted(paths):
        with Dataset(path) as ds:
            vname = _pick(ds, UTCI_NAMES, "UTCI")
            latname = _pick(ds, LAT_NAMES, "latitude")
            lonname = _pick(ds, LON_NAMES, "longitude")

            # Fill from the masked array itself: np.asarray() would discard the
            # mask and leave the -9e33 fill sentinel in place, which clamps to
            # the bottom of the colour ramp and paints sea ice near-black.
            var = ds.variables[vname]
            data = np.ma.filled(np.ma.asarray(var[:]).astype(np.float32), np.nan)
            data[data < -1e30] = np.nan
            if data.ndim == 2:
                data = data[None, ...]

            units = getattr(ds.variables[vname], "units", "K")
            if units.strip().upper().startswith("K"):
                data = data - 273.15

            this_lat = np.asarray(ds.variables[latname][:], dtype=np.float64)
            this_lon = np.asarray(ds.variables[lonname][:], dtype=np.float64)
            if lats is None:
                lats, lons = this_lat, this_lon
            elif not (
                np.array_equal(lats, this_lat) and np.array_equal(lons, this_lon)
            ):
                raise ValueError(f"grid mismatch in {path}")

            fields.append(data)

    assert lats is not None and lons is not None
    stack = np.concatenate(fields, axis=0)

    # Normalise longitudes to [-180, 180) and sort, so the map is centred on
    # the prime meridian rather than starting there.
    lons = ((lons + 180.0) % 360.0) - 180.0
    order = np.argsort(lons)
    lons = lons[order]
    stack = stack[:, :, order]

    # Latitudes descending (north at top) for direct image row order.
    if lats[0] < lats[-1]:
        lats = lats[::-1]
        stack = stack[:, ::-1, :]

    return stack, lats, lons


def sample_local(
    stack: np.ndarray, lons: np.ndarray, local_hour: float = 15.0
) -> np.ndarray:
    """Pick, per column, the UTC slice nearest `local_hour` local solar time."""
    n_hours = stack.shape[0]
    if n_hours < 48:
        print(
            f"warning: only {n_hours} hours loaded. Local sampling for western "
            "longitudes needs the following day; results there will wrap "
            "within the same day. Fetch two days for a correct map."
        )

    # Solar time offset from UTC, in whole hours, from longitude alone.
    offsets = np.rint(lons / 15.0).astype(np.int64)
    idx = np.rint(local_hour - offsets).astype(np.int64)
    idx = np.clip(idx, 0, n_hours - 1) if n_hours >= 48 else idx % n_hours

    rows = np.arange(stack.shape[1])
    # stack is (time, lat, lon); gather a different time per lon column.
    return stack[idx[None, :], rows[:, None], np.arange(len(lons))[None, :]]


def build_field(stack: np.ndarray, lons: np.ndarray, mode: str, hour: int,
                local_hour: float) -> np.ndarray:
    if mode == "local":
        return sample_local(stack, lons, local_hour)
    if mode == "mean":
        return np.nanmean(stack[:24], axis=0)
    if mode == "max":
        return np.nanmax(stack[:24], axis=0)
    if mode == "hour":
        return stack[hour]
    raise ValueError(f"unknown mode {mode}")


def render(field: np.ndarray, title: str, out: Path, scale: int = 1) -> None:
    rgb = colorize(field)
    img = Image.fromarray(rgb, mode="RGB")
    if scale != 1:
        img = img.resize(
            (img.width * scale, img.height * scale), Image.Resampling.NEAREST
        )

    legend_h, pad = 64, 16
    canvas = Image.new(
        "RGB", (img.width, img.height + legend_h + pad * 2), (0x0E, 0x0E, 0x12)
    )
    canvas.paste(img, (0, 0))

    strip_w = img.width - pad * 2
    strip = Image.fromarray(legend_strip(strip_w, 20), mode="RGB")
    strip_y = img.height + pad
    canvas.paste(strip, (pad, strip_y))

    draw = ImageDraw.Draw(canvas)
    for frac, value in legend_ticks():
        x = pad + int(frac * (strip_w - 1))
        draw.line([(x, strip_y + 20), (x, strip_y + 25)], fill=(200, 200, 200))
        label = f"{value:.0f}"
        draw.text((x - 3 * len(label), strip_y + 28), label, fill=(200, 200, 200))
    draw.text((pad, strip_y + 44), f"UTCI (C) - {title}", fill=(220, 220, 220))

    canvas.save(out)
    print(f"wrote {out}  ({canvas.width}x{canvas.height})")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="+", type=Path, help="NetCDF file(s)")
    ap.add_argument(
        "--mode", default="local", choices=["local", "mean", "max", "hour"]
    )
    ap.add_argument("--local-hour", type=float, default=15.0)
    ap.add_argument("--hour", type=int, default=12, help="UTC hour for --mode hour")
    ap.add_argument("--out", type=Path, default=Path("utci.png"))
    ap.add_argument("--scale", type=int, default=1, help="integer upscale")
    args = ap.parse_args()

    stack, lats, lons = load_stack(args.files)
    print(
        f"loaded {stack.shape[0]} hours, grid {stack.shape[1]}x{stack.shape[2]}, "
        f"lat {lats[0]:.2f}..{lats[-1]:.2f}, lon {lons[0]:.2f}..{lons[-1]:.2f}"
    )
    finite = np.isfinite(stack)
    print(
        f"UTCI range {np.nanmin(stack):.1f}..{np.nanmax(stack):.1f} C "
        f"({100 * finite.mean():.1f}% valid)"
    )

    field = build_field(stack, lons, args.mode, args.hour, args.local_hour)
    titles = {
        "local": f"{args.local_hour:.0f}:00 local solar time",
        "mean": "24-hour mean",
        "max": "24-hour maximum",
        "hour": f"{args.hour:02d}:00 UTC",
    }
    render(field, titles[args.mode], args.out, args.scale)


if __name__ == "__main__":
    main()
