"""
Colour ramp for UTCI, keyed to the ten official thermal-stress categories
(Broede et al. 2012).

Design notes, since these are the decisions you'll most want to argue with:

1. Each stress band gets an EQUAL SHARE OF COLOUR, not an equal share of degrees.
   The bands are wildly non-uniform -- "no thermal stress" spans 9..26 C (17 K)
   while its neighbours are 6 K. A linear ramp over degrees would paint most of
   the inhabited world a single shade and waste half the gradient on Antarctica.
   Interpolating per band fixes that and makes the legend agree with the map by
   construction.

2. LIGHTNESS PEAKS IN THE MIDDLE and falls off toward both extremes. That means
   in greyscale (or to a red-green colourblind viewer, ~8% of men) the image
   still reads as "distance from comfortable", with hue carrying the direction.
   You lose hot-vs-cold in greyscale, but that's inherent to any diverging map;
   this at least keeps the magnitude legible.

3. The cold end is very dark VIOLET rather than black, because black is also
   what no-data, ocean-masked and unrendered pixels look like.
"""

from __future__ import annotations

import numpy as np

# Upper edge of each band, in degrees C. The interior edges are the official
# category boundaries; -50 and 55 are clamps, and 17.5 is an extra anchor added
# purely so the wide comfortable band resolves to green in its middle rather
# than sliding straight from teal to yellow.
BAND_EDGES = np.array(
    [-50.0, -40.0, -27.0, -13.0, 0.0, 9.0, 17.5, 26.0, 32.0, 38.0, 46.0, 55.0]
)

BAND_COLORS = np.array(
    [
        (0x1A, 0x05, 0x26),  # <= -50  beyond extreme cold
        (0x34, 0x10, 0x52),  # -40     extreme cold stress
        (0x3A, 0x2E, 0x96),  # -27     very strong cold stress
        (0x2C, 0x6B, 0xD6),  # -13     strong cold stress
        (0x23, 0xA9, 0xDE),  #   0     moderate cold stress
        (0x35, 0xCB, 0xA8),  #   9     slight cold stress
        (0x63, 0xD4, 0x4A),  #  17.5   middle of no thermal stress
        (0xE8, 0xDC, 0x4F),  #  26     top of no thermal stress
        (0xF0, 0xA0, 0x2E),  #  32     moderate heat stress
        (0xE0, 0x5C, 0x22),  #  38     strong heat stress
        (0xB3, 0x20, 0x20),  #  46     very strong heat stress
        (0x4A, 0x0B, 0x0B),  # >= 55   extreme heat stress
    ],
    dtype=np.float64,
)

STRESS_CATEGORIES = [
    (-np.inf, -40, "extreme cold stress"),
    (-40, -27, "very strong cold stress"),
    (-27, -13, "strong cold stress"),
    (-13, 0, "moderate cold stress"),
    (0, 9, "slight cold stress"),
    (9, 26, "no thermal stress"),
    (26, 32, "moderate heat stress"),
    (32, 38, "strong heat stress"),
    (38, 46, "very strong heat stress"),
    (46, np.inf, "extreme heat stress"),
]

NODATA_COLOR = (0x0E, 0x0E, 0x12)


def colorize(utci_c: np.ndarray) -> np.ndarray:
    """Map an array of UTCI values (degrees C) to uint8 RGB.

    NaNs become NODATA_COLOR. Values outside the ramp are clamped.
    """
    values = np.asarray(utci_c, dtype=np.float64)
    finite = np.isfinite(values)
    safe = np.where(finite, values, 0.0)

    # Position along the ramp in "band units": band index + fraction within band.
    # np.interp does exactly this if we hand it the edges as x and indices as y.
    band_pos = np.interp(
        safe, BAND_EDGES, np.arange(len(BAND_EDGES), dtype=np.float64)
    )

    lower = np.floor(band_pos).astype(np.int64)
    lower = np.clip(lower, 0, len(BAND_COLORS) - 2)
    frac = (band_pos - lower)[..., None]

    rgb = BAND_COLORS[lower] * (1.0 - frac) + BAND_COLORS[lower + 1] * frac
    rgb = np.rint(rgb).astype(np.uint8)
    rgb[~finite] = NODATA_COLOR
    return rgb


def legend_strip(width: int = 1024, height: int = 48) -> np.ndarray:
    """A horizontal legend image spanning the full ramp, for reference."""
    # Sample in band space so the strip is proportioned like the colour ramp.
    band_pos = np.linspace(0, len(BAND_EDGES) - 1, width)
    values = np.interp(band_pos, np.arange(len(BAND_EDGES)), BAND_EDGES)
    row = colorize(values)
    return np.repeat(row[None, :, :], height, axis=0)


def legend_ticks() -> list[tuple[float, float]]:
    """(fraction along the legend, UTCI value) for each official band edge."""
    n = len(BAND_EDGES) - 1
    return [(i / n, float(v)) for i, v in enumerate(BAND_EDGES)]
