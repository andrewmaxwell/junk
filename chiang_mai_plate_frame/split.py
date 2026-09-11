"""
Split the frame into two bed-sized halves for the A1 (256 x 256 mm), with a
locating joint on the seam.

The frame is 328.8 mm wide against a 256 mm bed, and no 12-inch plate frame
fits an A1 whole -- the plate alone is 304.8 mm. Height is fine, so one vertical
cut at `SPLIT_X = OUTER_W/2` does it.

THE JOINT
---------
The halves are glued (CA), so the joint's job is registration, not retention:
hold the two halves in exact alignment, with plenty of bond area, while the glue
sets. Two constraints decide the geometry:

* **It has to print without support.** The part lies flat, so only features that
  run through the full thickness print cleanly. A half-lap would hide the joint
  behind a dead-straight seam, but it leaves one half with an unsupported
  cantilever over the pocket -- it would droop. So the locating features run the
  full 3.2 mm.
* **It has to assemble by pushing the halves together in-plane.** That means the
  profile must not undercut, which rules out a true snap-fit: nothing can click.
  A dovetail would lock, but only by sliding along the seam, and both rails
  would have to engage over the frame's whole height.

So: tapered locating tabs, one per rail, sized to the stretches of seam that
carry no artwork. The taper gives a lead-in that self-centres as it closes, then
seats on the tab's base width. Tabs get TAB_CLEARANCE for glue; the rest of the
seam is a zero-gap butt joint, so the visible line stays tight.

Run:  python split.py    ->  split_preview.png + stl/pieces/*.stl
"""
import functools
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely.geometry import Polygon, box, LineString
from shapely.ops import unary_union
import shapely.affinity as aff

import build_frame as bf
from plate_lib import plot_layers
from mesh_util import extrude_layers, as_polygons, dropped_area, BED_X, BED_Y

HERE = os.path.dirname(os.path.abspath(__file__))

SPLIT_X = bf.OUTER_W / 2      # 164.4 -- exactly half

TAB_LEN = 11.0                # preferred tab width along the seam, at its base
TAB_LEN_MIN = 4.0             # accept a shorter tab where artwork crowds the seam
TAB_DEPTH = 4.0               # how far it reaches across
TAB_TAPER_DEG = 6.0           # lead-in; self-centres as the halves close
TAB_FILLET = 0.4              # rounds the corners so they seat cleanly
TAB_CLEARANCE = 0.15          # gap per face, for glue
ART_MARGIN = 1.5              # keep tabs this clear of any artwork

COLOURS = ["white", "red", "black", "green"]
COLOUR_HEX = {"white": "#ffffff", "red": "#e2231a",
              "black": "#1a1a1a", "green": "#1c7a3c"}
FAR = 1000.0


def _seam_runs(geom, x=SPLIT_X):
    """y-intervals where `geom` meets the seam."""
    line = LineString([(x, -FAR), (x, FAR)])
    i = line.intersection(geom)
    if i.is_empty:
        return []
    gs = list(i.geoms) if hasattr(i, "geoms") else [i]
    return sorted((min(c[1] for c in g.coords), max(c[1] for c in g.coords))
                  for g in gs if g.length > 0)


def tab_positions():
    """Centre y for one tab per run of frame material.

    The free stretch has to be judged over the tab's whole footprint, not just
    along the seam line -- artwork that clears the seam can still dip into the
    band the tab reaches into.
    """
    art = unary_union(list(bf.art.values()))
    band = box(SPLIT_X - ART_MARGIN, -FAR,
               SPLIT_X + TAB_DEPTH + ART_MARGIN, FAR)
    blocked = []
    for g in as_polygons(art.intersection(band)):
        blocked.append(box(0, g.bounds[1] - ART_MARGIN, 1, g.bounds[3] + ART_MARGIN))
    blocked = unary_union(blocked) if blocked else None

    out = []
    for y0, y1 in _seam_runs(bf.frame_outline):
        free = box(0, y0 + ART_MARGIN, 1, y1 - ART_MARGIN)
        if blocked is not None:
            free = free.difference(blocked)
        best = None
        for g in as_polygons(free):
            a, b = g.bounds[1], g.bounds[3]
            if best is None or (b - a) > (best[1] - best[0]):
                best = (a, b)
        if best is None:
            continue
        avail = best[1] - best[0]
        if avail < TAB_LEN_MIN:
            continue
        length = min(TAB_LEN, avail)
        cy = (best[0] + best[1]) / 2
        # the tab must also sit entirely on frame material
        if _tab(cy, length).difference(bf.frame_outline).area > 1e-6:
            continue
        out.append((cy, length))
    return out


def _tab(cy, length=TAB_LEN):
    """One tapered, fillet-cornered tab protruding from the left half."""
    hb = length / 2
    ht = hb - TAB_DEPTH * math.tan(math.radians(TAB_TAPER_DEG))
    poly = Polygon([(SPLIT_X, cy - hb), (SPLIT_X + TAB_DEPTH, cy - ht),
                    (SPLIT_X + TAB_DEPTH, cy + ht), (SPLIT_X, cy + hb)])
    return poly.buffer(-TAB_FILLET, join_style=1).buffer(TAB_FILLET, join_style=1)


@functools.lru_cache(maxsize=None)
def _halves():
    """-> ({"left": region, "right": region}, [tab polygons]).

    Cached: build_frame's fit loops are the expensive part, but tab placement
    is not free either and both pieces() and main() want the same answer.
    """
    tabs = [_tab(cy, ln) for cy, ln in tab_positions()]
    tab_union = unary_union(tabs) if tabs else None
    left = box(-FAR, -FAR, SPLIT_X, FAR)
    if tab_union is not None:
        left = unary_union([left, tab_union])
    right = box(SPLIT_X, -FAR, FAR, FAR)
    if tab_union is not None:
        right = right.difference(tab_union.buffer(TAB_CLEARANCE, join_style=1))
    return {"left": left, "right": right}, tabs


def pieces():
    """-> {piece: {"_outline": region, "layers": [(colour, geom, z0, h), ...]}}"""
    halves, _tabs = _halves()
    out = {}
    for name, half in halves.items():
        layers = []
        for colour, geom, z0, h in bf.LAYERS:
            g = geom.intersection(half)
            if not g.is_empty and g.area > 0.05:
                layers.append((colour, g, z0, h))
        out[name] = {"_outline": bf.silhouette.intersection(half),
                     "layers": layers}
    return out


def colour_specs(layers, colour):
    return [(g, z0, h) for c, g, z0, h in layers if c == colour]


def check(cond, label, detail=""):
    """Assert `cond`, printing the line either way so a run is self-documenting.

    Shared with export_3mf.verify(); the point of printing the passing cases too
    is that a run's output is the evidence, not just the absence of a traceback.
    """
    print(f"  [{'ok' if cond else 'FAIL'}] {label}{'  ' + detail if detail else ''}")
    if not cond:
        raise AssertionError(label + (" -- " + detail if detail else ""))


def main():
    P = pieces()
    _halves_map, tabs = _halves()
    art = unary_union(list(bf.art.values()))
    print(f"cut at x={SPLIT_X:.1f} mm (exactly half)")
    print(f"joint: {len(tabs)} tapered locating tabs, up to {TAB_LEN} x {TAB_DEPTH} mm, "
          f"{TAB_TAPER_DEG}deg taper, {TAB_CLEARANCE} mm clearance per face")
    for t in tabs:
        b = t.bounds
        print(f"   tab y {b[1]:6.1f}..{b[3]:6.1f} ({b[3]-b[1]:4.1f} mm)")
    print(f"emboss {bf.EMBOSS_H} mm proud, total thickness "
          f"{bf.FRAME_THK + bf.EMBOSS_H} mm\n")

    outdir = os.path.join(HERE, "stl", "pieces")
    os.makedirs(outdir, exist_ok=True)
    watertight = {}
    for name, piece in P.items():
        reg = piece["_outline"]
        x0, y0, x1, y1 = reg.bounds
        w, h = x1 - x0, y1 - y0
        print(f"{name:6s} {w:6.1f} x {h:6.1f} mm  "
              f"{'fits' if w <= BED_X and h <= BED_Y else '*** TOO BIG ***'}"
              f"   ({len(as_polygons(reg))} part(s))")
        for c in COLOURS:
            specs = colour_specs(piece["layers"], c)
            if not specs:
                continue
            m = extrude_layers(specs)
            if m is None:
                continue
            m.export(os.path.join(outdir, f"{name}_{c}.stl"))
            watertight[f"{name}_{c}"] = m.is_watertight
            print(f"         {c:6s} z {m.bounds[0][2]:.1f}-{m.bounds[1][2]:.1f} mm  "
                  f"{len(m.faces):6d} faces  watertight={m.is_watertight}")

    verify(P, tabs, art, watertight)

    fig, ax = plt.subplots(figsize=(14, 7), dpi=150)
    layers = []
    for name, piece in P.items():
        dx = -6 if name == "left" else 6
        for c in COLOURS:
            for g, z0, _h in sorted(colour_specs(piece["layers"], c),
                                    key=lambda t: t[1]):
                layers.append((aff.translate(g, dx, 0), COLOUR_HEX[c], z0))
    layers.sort(key=lambda t: t[2])
    plot_layers(ax, [(g, c) for g, c, _z in layers], bg="#dcdcdc")
    ax.margins(0.02)
    plt.savefig(os.path.join(HERE, "split_preview.png"),
                bbox_inches="tight", facecolor="#dcdcdc")
    print("\nsaved split_preview.png")


def verify(P, tabs, art, watertight):
    """Every claim the README makes about the split, checked on each run."""
    print("\nchecks:")
    L, R = P["left"]["_outline"], P["right"]["_outline"]

    for name, reg in (("left", L), ("right", R)):
        x0, y0, x1, y1 = reg.bounds
        check(x1 - x0 <= BED_X and y1 - y0 <= BED_Y,
               f"{name} fits the {BED_X:.0f} x {BED_Y:.0f} mm bed",
               f"{x1-x0:.1f} x {y1-y0:.1f} mm")

    for t in tabs:
        a = t.intersection(art).area
        check(a < 1e-9, f"tab at y {t.bounds[1]:.1f}..{t.bounds[3]:.1f} clears artwork",
               f"{a:.6f} mm^2")

    check(L.intersection(R).area < 1e-9, "halves do not overlap",
           f"{L.intersection(R).area:.6f} mm^2")
    check(L.distance(R) < 1e-9, "butt seam closes",
           f"{L.distance(R):.3f} mm gap")

    # Reassembling the halves must give back the whole frame, apart from the
    # glue clearance milled around each tab.
    lost = bf.silhouette.symmetric_difference(unary_union([L, R])).area
    budget = sum(t.buffer(TAB_CLEARANCE, join_style=1).area - t.area for t in tabs)
    check(lost <= budget + 1e-6, "reassembled halves == whole frame",
           f"{lost:.3f} mm^2 removed, all of it tab clearance (budget {budget:.3f})")

    check(dropped_area() < 1e-9, "no geometry dropped while meshing",
           f"{dropped_area():.3f} mm^2")
    check(all(watertight.values()), "all meshes watertight",
           f"{sum(watertight.values())}/{len(watertight)}")


if __name__ == "__main__":
    main()
