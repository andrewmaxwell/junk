"""
Render a UTCI timelapse: one video frame per hourly UTC slice.

  python render_video.py data/*.nc --out utci_30day.mp4

This is `render_utci.py --mode hour` run over every hour in every file and
piped straight into ffmpeg. Because each frame is one UTC instant, the
day/night terminator is visible and sweeps westward through the frame -- 15
degrees of longitude per frame, one full rotation per 24 frames.

At the default 24 fps, 30 days of hourly data (720 frames) is a 30 second clip:
one day per second.

No legend, by design. The only text is a small UTC timestamp; pass
--no-timestamp for a bare map.

Frames are streamed one file at a time and handed to ffmpeg as raw RGB, so
peak memory is roughly one day of data plus one frame, not the whole month.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Iterator

import numpy as np
from netCDF4 import Dataset, num2date  # type: ignore[import-untyped]
from PIL import Image, ImageDraw, ImageFont

from colormap import BAND_EDGES, NODATA_COLOR, colorize
from render_utci import (
    LAT_NAMES,
    LON_NAMES,
    TIME_NAMES,
    UTCI_NAMES,
    _pick,
)

# Colour lookup table. colorize() is a float64 piecewise interpolation, which
# is fine for one image and wasteful for 720 of them at 3.5 megapixels. A 4096
# entry LUT over the ramp quantises to 0.026 C -- far below anything visible.
LUT_N = 4096
_LUT = colorize(np.linspace(BAND_EDGES[0], BAND_EDGES[-1], LUT_N))

FONT_CANDIDATES = (
    "/System/Library/Fonts/SFNSMono.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Supplemental/Andale Mono.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
)


def colorize_lut(field: np.ndarray) -> np.ndarray:
    """Same mapping as colormap.colorize, via LUT. Returns uint8 RGB."""
    lo, hi = BAND_EDGES[0], BAND_EDGES[-1]
    pos = (field - lo) * ((LUT_N - 1) / (hi - lo))

    finite = np.isfinite(pos)
    all_finite = bool(finite.all())
    if not all_finite:
        pos = np.where(finite, pos, 0.0)

    np.clip(pos, 0, LUT_N - 1, out=pos)
    rgb = _LUT[pos.astype(np.uint16)]
    if not all_finite:
        rgb[~finite] = NODATA_COLOR
    return rgb


def _resize(plane: np.ndarray, width: int, height: int) -> np.ndarray:
    """Bilinear resize of one float plane, wrapping at the antimeridian.

    The map is periodic in longitude, so a column from each edge is pasted onto
    the opposite side before resampling and trimmed afterwards. Without it,
    bilinear edge clamping leaves a visible seam down the left and right edges.
    """
    scale_x = width / plane.shape[1]
    pad_dst = max(1, int(round(scale_x)))

    wrapped = np.concatenate([plane[:, -1:], plane, plane[:, :1]], axis=1)
    img = Image.fromarray(np.ascontiguousarray(wrapped, dtype=np.float32), "F")
    img = img.resize((width + 2 * pad_dst, height), Image.Resampling.BILINEAR)
    return np.asarray(img)[:, pad_dst : pad_dst + width]


def upscale(field: np.ndarray, width: int, height: int) -> np.ndarray:
    """Resample the UTCI field itself (not its colours) to the output size.

    Interpolating values and then colouring keeps band boundaries crisp;
    interpolating RGB would smear one band's colour into the next.

    About 0.3% of pixels are no-data (sea ice, mostly). Resampling those
    straight would bleed NaN into every neighbour and grow each speck into a
    blot, so valid pixels are interpolated by normalised convolution: resample
    value-times-validity and validity separately, then divide. A destination
    pixel is no-data only if valid sources make up less than half its weight,
    which keeps holes roughly their true size instead of letting them spread or
    quietly filling them in with invented values.
    """
    finite = np.isfinite(field)
    if bool(finite.all()):
        return _resize(field, width, height)

    weight = finite.astype(np.float32)
    num = _resize(np.where(finite, field, 0.0).astype(np.float32), width, height)
    den = _resize(weight, width, height)
    return np.where(den >= 0.5, num / np.maximum(den, 1e-6), np.nan)


def load_font(width: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = max(12, width // 90)
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    print("warning: no TrueType font found; timestamp will be tiny")
    return ImageFont.load_default()


def iter_frames(path: Path) -> Iterator[tuple[str, np.ndarray]]:
    """Yield (timestamp label, field in Celsius, north-up, -180..180) per hour."""
    with Dataset(path) as ds:
        vname = _pick(ds, UTCI_NAMES, "UTCI")
        latname = _pick(ds, LAT_NAMES, "latitude")
        lonname = _pick(ds, LON_NAMES, "longitude")
        tname = _pick(ds, TIME_NAMES, "time")

        lats = np.asarray(ds.variables[latname][:], dtype=np.float64)
        lons = np.asarray(ds.variables[lonname][:], dtype=np.float64)
        lons = ((lons + 180.0) % 360.0) - 180.0
        order = np.argsort(lons)
        flip_lat = lats[0] < lats[-1]

        tvar = ds.variables[tname]
        times = num2date(tvar[:], getattr(tvar, "units", "hours since 1900-01-01"))

        var = ds.variables[vname]
        kelvin = str(getattr(var, "units", "K") or "K").strip().upper().startswith("K")

        for i in range(var.shape[0]):
            # np.asarray() would DISCARD the mask and leave the -9e33 fill
            # sentinel in the array, where it clamps to the bottom of the ramp
            # and paints sea ice near-black. Fill from the masked array itself,
            # then belt-and-braces the sentinel in case auto-masking is off.
            data = np.ma.filled(
                np.ma.asarray(var[i]).astype(np.float32), np.nan
            )
            data[data < -1e30] = np.nan
            if kelvin:
                data = data - 273.15
            data = data[:, order]
            if flip_lat:
                data = data[::-1, :]
            label = f"{times[i].strftime('%Y-%m-%d %H:%M')} UTC"
            yield label, data


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="+", type=Path, help="NetCDF file(s)")
    ap.add_argument("--out", type=Path, default=Path("utci_timelapse.mp4"))
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--width", type=int, default=2880)
    ap.add_argument("--height", type=int, default=1200)
    ap.add_argument("--crf", type=int, default=16, help="x264 quality, lower is better")
    ap.add_argument("--preset", default="slow")
    ap.add_argument("--no-timestamp", action="store_true")
    ap.add_argument("--limit", type=int, help="stop after N frames (for a test)")
    args = ap.parse_args()

    if args.width % 2 or args.height % 2:
        sys.exit("width and height must both be even for yuv420p H.264")

    paths = sorted(set(args.files))
    if not paths:
        sys.exit("no input files")

    font = None if args.no_timestamp else load_font(args.width)
    margin = max(8, args.width // 120)

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{args.width}x{args.height}", "-r", str(args.fps),
        "-i", "-", "-an",
        "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
        "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(args.out),
    ]
    print(f"{len(paths)} file(s) -> {args.out} at {args.width}x{args.height} {args.fps}fps")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None

    count = 0
    first = last = None
    try:
        for path in paths:
            for label, field in iter_frames(path):
                if args.limit is not None and count >= args.limit:
                    raise StopIteration
                rgb = colorize_lut(upscale(field, args.width, args.height))

                if font is not None:
                    img = Image.fromarray(rgb, "RGB")
                    draw = ImageDraw.Draw(img)
                    draw.text(
                        (margin, args.height - margin),
                        label,
                        font=font,
                        fill=(240, 240, 240),
                        anchor="ls",
                        stroke_width=max(1, args.width // 900),
                        stroke_fill=(0, 0, 0),
                    )
                    rgb = np.asarray(img)

                proc.stdin.write(np.ascontiguousarray(rgb).tobytes())
                count += 1
                first = first or label
                last = label
                if count % 24 == 0:
                    print(f"  {count} frames  ({label})", flush=True)
    except StopIteration:
        pass
    finally:
        proc.stdin.close()
        rc = proc.wait()

    if rc != 0:
        sys.exit(f"ffmpeg exited {rc}")
    print(
        f"wrote {args.out}: {count} frames, {count / args.fps:.1f}s\n"
        f"  {first}  ->  {last}"
    )


if __name__ == "__main__":
    main()
