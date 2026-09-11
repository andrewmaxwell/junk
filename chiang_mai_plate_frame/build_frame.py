"""
Chiang Mai Honda license plate frame -- geometry.

Layout: one content row in the bottom rail, level with the bottom screw holes.
Logo sits left of the left hole, "cmhonda.com" right of the right hole, and the
"Chiang Mai Honda" script fills the middle. Nothing comes within HOLE_KEEPOUT
of a screw hole.

Logo and script come from SVG artwork (see svg_import.py), not from fonts.
"""
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely.geometry import box, LineString, Point
from shapely.ops import unary_union
import shapely.affinity as aff

from plate_lib import text_polygon, rounded_rect, plot_layers, FONT_BOLD
from svg_import import load_svg_layers, fit_layers

HERE = os.path.dirname(os.path.abspath(__file__))

# ================= PARAMETERS (all mm) =================
IN = 25.4
PLATE_W = 12*IN          # 304.8  standard US/MO plate
PLATE_H = 6*IN           # 152.4

RIM_SIDE = 12             # visible border beyond the plate, left/right
RIM_TOP = 12              # visible border above the plate
BOTTOM_EXT = 6            # material below the plate's bottom edge
OVERLAP_SIDE = 6          # frame covers this much of the plate's edge, L/R
OVERLAP_TOP = 6           # covers this much of the plate's top edge
OVERLAP_BOTTOM = 28       # covers this much of the plate's bottom margin.
                          # The plate's "SAMPLE" characters stop 37.9mm up from
                          # its bottom edge (measured, see measure_holes.py), so
                          # this clears all lettering by ~9.9mm and covers only
                          # the decorative wave border.

RAIL_H = BOTTOM_EXT + OVERLAP_BOTTOM     # 34 -- height of the branded bottom rail

OUTER_CORNER_R = 10
OPENING_CORNER_R = 8.5
FRAME_THK = 3.2           # base plate thickness (mm)
EMBOSS_H = 1.0            # logo/text/vectors stand this proud of the frame face.
                          # Total part thickness is FRAME_THK + EMBOSS_H. The back
                          # stays flat against the plate, and because the bottom
                          # FRAME_THK is pure white the AMS only has to purge in
                          # the top EMBOSS_H of layers.

# ---------------- MOUNTING (measured, see measure_holes.py) ----------------
# The plate's own holes measure 176.8 x 119.6 mm at 7.93 mm dia -- the standard
# US pattern (7.000 x 4.750 in, 5/16 in) to within ~1 mm. 1 px of the source
# image is 0.63 mm, so the residual is noise; we use the exact standard.
HOLE_SPACING_X = 7.00*IN     # 177.80
HOLE_SPACING_Y = 4.75*IN     # 120.65
PLATE_HOLE_D   = 0.3125*IN   # 7.94  the hole in the plate itself
HOLE_D         = 9.0         # ours: oversized for bolt clearance + FDM tolerance
HOLE_KEEPOUT   = 3.0         # clear space around each hole, from its edge.
                             # 3mm past a 9mm hole leaves a 15mm circle clear,
                             # enough for a plate bolt's head or washer.
MOUNT_MODE = "all4"          # "all4" | "top2" | "bottom2"
BOSS_R = 7.5                 # material pad radius around a top hole

# ---------------- content row ----------------
SIDE_MARGIN = 6.0         # from the frame's outer edge to logo / url
URL_BOTTOM_MARGIN = 2.5   # "cmhonda.com" sits this far up from the bottom edge
URL_SCRIPT_GAP = 4.0      # clear space between the script and the url
SCRIPT_RED = True         # the script wordmark prints red, matching the logo
SPEEDLINE_MIN_W = 0.8     # thicken the logo's speed lines to this (0.4mm nozzle)

OUTER_W = PLATE_W + 2*RIM_SIDE           # 328.8
OUTER_H = RIM_TOP + PLATE_H + BOTTOM_EXT # 170.4

OPEN_W = PLATE_W - 2*OVERLAP_SIDE
OPEN_H = PLATE_H - OVERLAP_TOP - OVERLAP_BOTTOM
OPEN_X0 = RIM_SIDE + OVERLAP_SIDE
OPEN_Y0 = RAIL_H

# ================= outline =================
outer = rounded_rect(0, 0, OUTER_W, OUTER_H, OUTER_CORNER_R)
opening = rounded_rect(OPEN_X0, OPEN_Y0, OPEN_X0+OPEN_W, OPEN_Y0+OPEN_H, OPENING_CORNER_R)
frame_outline = outer.difference(opening)

# ================= mounting holes =================
PLATE_CX = RIM_SIDE + PLATE_W/2
PLATE_CY = BOTTOM_EXT + PLATE_H/2
HOLE_X = (PLATE_CX - HOLE_SPACING_X/2, PLATE_CX + HOLE_SPACING_X/2)
HOLE_Y_BOT = PLATE_CY - HOLE_SPACING_Y/2
HOLE_Y_TOP = PLATE_CY + HOLE_SPACING_Y/2
KEEPOUT_R = HOLE_D/2 + HOLE_KEEPOUT

use_top = MOUNT_MODE in ("all4", "top2")
use_bot = MOUNT_MODE in ("all4", "bottom2")

# The top rim is thin so "MISSOURI / SHOW-ME STATE" (14.7-24.1mm down from the
# plate's top edge) stays visible, so the top holes get local bosses instead of
# a wider rim. Their x positions clear all of the plate's lettering.
bosses = []
if use_top:
    for hx in HOLE_X:
        pad = Point(hx, HOLE_Y_TOP).buffer(BOSS_R, quad_segs=32)
        neck = box(hx - BOSS_R, HOLE_Y_TOP, hx + BOSS_R, OUTER_H)
        bosses.append(unary_union([pad, neck]))
if bosses:
    frame_outline = unary_union([frame_outline] + bosses).intersection(outer)

hole_centres = []
if use_top:
    hole_centres += [(hx, HOLE_Y_TOP) for hx in HOLE_X]
if use_bot:
    hole_centres += [(hx, HOLE_Y_BOT) for hx in HOLE_X]
holes = unary_union([Point(x, y).buffer(HOLE_D/2, quad_segs=32)
                     for x, y in hole_centres])
frame_outline = frame_outline.difference(holes)

# ================= content row =================
# Sizes are not hand-set: each element is grown until it hits a real constraint
# (the rail edges, the 2D keepout around a screw hole, or the frame outline).
# Measuring true 2D distance rather than a vertical band matters -- the script's
# widest point sits at 45% of its height, off the holes' centreline, which buys
# about 5 mm of extra width.
_hole_disc = [Point(x, y).buffer(HOLE_D/2, quad_segs=64) for x, y in
              [(hx, HOLE_Y_BOT) for hx in HOLE_X]]


# The fit loops converge onto the constraint from below, and the hole discs are
# polygons inscribed in the real circles, so aim a hair past the keepout --
# otherwise the result lands a fraction of a micron short and fails its own check.
_FIT_EPS = 0.02


def _clears(geom):
    """True if `geom` keeps HOLE_KEEPOUT clear of every bottom hole's edge."""
    return min(geom.distance(h) for h in _hole_disc) >= HOLE_KEEPOUT + _FIT_EPS


def _grow(build, ok, lo, hi, iters=34):
    """Largest size in [lo, hi] for which ok(build(size)) holds."""
    for _ in range(iters):
        mid = (lo + hi) / 2
        if ok(build(mid)):
            lo = mid
        else:
            hi = mid
    return lo


def _norm_colour(hexstr):
    """Map the logo's many near-black inks onto our three filaments."""
    r, g, b = (int(hexstr[i:i+2], 16) for i in (1, 3, 5))
    if r > 200 and g < 90 and b < 90:
        return "red"
    if r > 200 and g > 200 and b > 200:
        return "white"
    return "black"


def _thicken_slivers(geom, min_w):
    """Fatten parts thinner than min_w so a 0.4mm nozzle can print them.
    The logo's speed lines are 0.31mm at this scale; without this they would
    print as a smear or be dropped by the slicer."""
    parts = list(geom.geoms) if hasattr(geom, "geoms") else [geom]
    out, n = [], 0
    for p in parts:
        t = 4*p.area/p.length if p.length else min_w
        if t < min_w:
            out.append(p.buffer((min_w - t)/2, quad_segs=8, join_style=1))
            n += 1
        else:
            out.append(p)
    return unary_union(out), n


# --- logo: left of the left screw hole, filling the rail as far as it can ---
_logo_raw = load_svg_layers(os.path.join(HERE, "chiang-mai-honda-logo-smooth.svg"))


def _build_logo(h):
    """Logo at height h, placed and with the speed lines already thickened.

    Thickening has to happen inside the fit loop, not after it: the speed lines
    are on the logo's right edge, nearest the screw hole, so fattening them
    afterwards would eat into the keepout the fit had just satisfied.
    """
    F, w, hh = fit_layers(_logo_raw, height=h)
    red, black = None, []
    for c, g in F.items():
        kind = _norm_colour(c)
        if kind == "red":
            red = g
        elif kind == "black":
            black.append(g)
    black = unary_union(black)
    red, n = _thicken_slivers(red, SPEEDLINE_MIN_W)
    red = red.difference(black)
    dx, dy = SIDE_MARGIN, (RAIL_H - hh)/2
    red = aff.translate(red, dx, dy)
    black = aff.translate(black, dx, dy)
    return red, black, w, hh, n


def _logo_ok(t):
    red, black, _w, hh, _n = t
    both = unary_union([red, black])
    return (hh <= RAIL_H
            and _clears(both)
            and both.difference(frame_outline).area < 1e-6)


logo_h = _grow(_build_logo, _logo_ok, 10.0, RAIL_H)
logo_red, logo_black, logo_w, logo_h, n_thick = _build_logo(logo_h)

# --- script: spans the gap between the bottom holes, top on the rail edge ---
# Sized by width; its 4.16:1 aspect then makes it taller than the rail, which is
# the point -- the "g" descender hangs off the bottom edge of the frame.
_script_raw = load_svg_layers(os.path.join(HERE, "chiang-mai-honda-script.svg"))


def _place_script(w):
    F, ww, hh = fit_layers(_script_raw, width=w)
    g = unary_union(list(F.values()))
    return aff.translate(g, (OUTER_W - ww)/2, RAIL_H - hh), ww, hh


script_w = _grow(_place_script, lambda t: _clears(t[0]), 80.0, 260.0)
script, script_w, script_h = _place_script(script_w)
SCRIPT_DANGLE = script_h - RAIL_H

# --- "cmhonda.com": low and right, tucked under the right screw hole ---
# Sitting below the hole rather than beside it means the keepout no longer caps
# its width, so it can be a good deal larger than when it sat on the centreline.
def _place_url(cap):
    t = text_polygon("cmhonda.com", FONT_BOLD, cap, tracking=1.0)
    b = t.bounds
    return (aff.translate(t, OUTER_W - SIDE_MARGIN - (b[2]-b[0]) - b[0],
                          URL_BOTTOM_MARGIN - b[1]),
            b[2]-b[0], b[3]-b[1])


def _url_ok(t):
    g = t[0]
    return (_clears(g)
            and g.distance(script) >= URL_SCRIPT_GAP
            and g.difference(frame_outline).area < 1e-6)


URL_CAP_H = _grow(_place_url, _url_ok, 3.0, 20.0)
url_text, url_w, url_h = _place_url(URL_CAP_H)

# ================= colour groups =================
# Artwork is embossed, not inlaid: the frame is a solid white plate and the
# colours sit on top of it.
red_all = unary_union([logo_red, script] if SCRIPT_RED else [logo_red])
black_all = unary_union([logo_black, script]) if not SCRIPT_RED else logo_black
green_all = url_text

art = {"red": red_all, "black": black_all, "green": green_all}

# Anything hanging off the frame (the script's descender) has no frame beneath
# it, so it would print in mid-air as a raised layer. Give it its own full-depth
# base so it is solid from the bed up.
#
# The cut is taken against a slightly shrunk frame so the descender crosses it
# transversally. Cutting exactly on the frame edge leaves the tail tangent to it,
# pinching to a knife point where four faces meet -- which is a non-manifold edge
# no boolean can clean up. Biting OVERHANG_BITE into the frame turns that single
# tangent point into a proper interval; the white base gives up the same sliver,
# so the two never overlap.
# Bite into the OUTER boundary only. Shrinking the whole outline would also pull
# back from the plate opening, and the script's top sits exactly on that edge --
# which would wrongly flag a sliver there as overhang and pinch the white base.
OVERHANG_BITE = 0.4
_cut = outer.buffer(-OVERHANG_BITE, join_style=2).difference(opening)
overhang = {c: g.difference(_cut) for c, g in art.items()}
overhang = {c: g for c, g in overhang.items() if not g.is_empty and g.area > 0.01}
_overhang_all = unary_union(list(overhang.values())) if overhang else None
if _overhang_all is not None:
    frame_base = frame_outline.difference(_overhang_all)
else:
    frame_base = frame_outline

silhouette = unary_union([frame_outline] + list(art.values()))

# (colour, 2D region, z start, height) -- everything downstream builds from this
# Which colour that full-depth base is printed in decides the whole print's
# purge budget. Only 23.5 mm^2 of the part overhangs -- the tip of the script's
# descender -- but making it red means red exists on every one of the 21 layers,
# so the AMS has to swap on every layer. Printing it white confines every colour
# to the top EMBOSS_H, and the base's 16 layers become a single-colour print.
# The cost is that the descender's 3.2 mm sidewall is white where it hangs below
# the frame; head-on it still reads as solid red.
OVERHANG_BASE_WHITE = True

_base = ([("white", unary_union([frame_base] + list(overhang.values())), 0.0, FRAME_THK)]
         if OVERHANG_BASE_WHITE else
         [("white", frame_base, 0.0, FRAME_THK)]
         + [(c, g, 0.0, FRAME_THK) for c, g in overhang.items()])

LAYERS = _base + [(c, g, FRAME_THK, EMBOSS_H) for c, g in art.items()]


def report():
    print(f"OUTER: {OUTER_W:.1f} x {OUTER_H:.1f} mm "
          f"({OUTER_W/IN:.2f} x {OUTER_H/IN:.2f} in)   bottom rail {RAIL_H} mm")
    print(f"bottom rail: y 0..{RAIL_H}, keepout {HOLE_KEEPOUT} mm from each hole edge")
    lb = unary_union([logo_red, logo_black]).bounds
    print(f"  logo   {logo_w:6.1f} x {logo_h:5.1f} mm  x {lb[0]:.1f}..{lb[2]:.1f}  "
          f"y {lb[1]:.1f}..{lb[3]:.1f}  (rail 0..{RAIL_H})")
    print(f"  script {script_w:6.1f} x {script_h:5.1f} mm  at x "
          f"{(OUTER_W-script_w)/2:.1f}..{(OUTER_W+script_w)/2:.1f}"
          f"  (spans the full gap between the holes)")
    print(f"         dangles {SCRIPT_DANGLE:.1f} mm below the frame's bottom edge; "
          f"{sum(g.area for g in overhang.values()):.1f} mm^2 gets a full-depth base")
    print(f"  emboss {EMBOSS_H} mm proud -> total part thickness "
          f"{FRAME_THK + EMBOSS_H} mm")
    ub = url_text.bounds
    print(f"  url    {url_w:6.1f} x {url_h:5.1f} mm  cap {URL_CAP_H:.2f} mm  "
          f"x {ub[0]:.1f}..{ub[2]:.1f}  y {ub[1]:.1f}..{ub[3]:.1f}"
          f"  (below the hole at y {HOLE_Y_BOT:.1f})")
    print(f"  thickened {n_thick} speed-line slivers to {SPEEDLINE_MIN_W} mm")
    print(f"mount: {MOUNT_MODE} -> {len(hole_centres)} holes dia {HOLE_D}, "
          f"keepout {HOLE_KEEPOUT:.2f} mm from edge")
    all_art = unary_union(list(art.values()))
    worst = min(Point(x, y).distance(all_art) - HOLE_D/2 for x, y in hole_centres)
    ok = worst >= HOLE_KEEPOUT - 1e-6
    print(f"  closest artwork to any hole edge: {worst:.2f} mm "
          f"({'OK' if ok else 'VIOLATION'})")
    assert ok, f"artwork is {worst:.3f} mm from a hole edge, keepout is {HOLE_KEEPOUT}"



if __name__ == "__main__":
    report()
    fig, ax = plt.subplots(figsize=(13, 7), dpi=150)
    plot_layers(ax, [(frame_outline, "#ffffff"), (red_all, "#e2231a"),
                     (black_all, "#1a1a1a"), (green_all, "#1c7a3c")], bg="#dcdcdc")
    ax.margins(0.02)
    plt.savefig(os.path.join(HERE, "frame_preview.png"), bbox_inches='tight', facecolor="#dcdcdc")
    print("saved frame_preview.png")

    # cross-section through the content row, showing the embossed relief
    cut_y = RAIL_H / 2
    fig, ax = plt.subplots(figsize=(13, 2.6), dpi=150)
    hexes = {"white": "#ffffff", "red": "#e2231a",
             "black": "#1a1a1a", "green": "#1c7a3c"}
    line = LineString([(-10, cut_y), (OUTER_W + 10, cut_y)])
    for colour, geom, z0, h in LAYERS:
        seg = line.intersection(geom)
        if seg.is_empty:
            continue
        for part in (seg.geoms if hasattr(seg, "geoms") else [seg]):
            xs = [c[0] for c in part.coords]
            ax.add_patch(plt.Rectangle((min(xs), z0), max(xs) - min(xs), h,
                                       facecolor=hexes[colour], edgecolor="#888",
                                       linewidth=0.3))
    ax.set_xlim(-5, OUTER_W + 5)
    ax.set_ylim(-1, FRAME_THK + EMBOSS_H + 2)
    ax.set_aspect(3.0)
    ax.set_yticks([0, FRAME_THK, FRAME_THK + EMBOSS_H])
    ax.set_ylabel("mm")
    ax.set_title(f"section at y={cut_y:.0f} mm — {FRAME_THK} mm base, "
                 f"artwork {EMBOSS_H} mm proud", fontsize=9)
    ax.set_facecolor("#dcdcdc")
    plt.savefig(os.path.join(HERE, "emboss_preview.png"), bbox_inches="tight", facecolor="#dcdcdc")
    print("saved emboss_preview.png")
