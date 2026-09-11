"""
Import an SVG's filled paths as shapely geometry, grouped by colour.

Handles the two things that matter for this project:

* **Painter's order.** Later paths paint over earlier ones. The Chiang Mai
  Honda logo relies on this -- the "HONDA" wordmark is white paths drawn on
  top of the red bar, not holes in it. So each path is subtracted from every
  colour accumulated so far before being added to its own.
* **Holes.** A subpath nested inside an odd number of other subpaths is a
  hole (even-odd). This is what makes letter counters ("O", "A") come out
  hollow.

SVG y grows downward; everything here is flipped to y-up to match the frame.
"""
from collections import OrderedDict

from shapely.geometry import Polygon
from shapely.ops import unary_union
import shapely.affinity as aff
from svgelements import SVG, Path, Shape

FLATNESS = 0.25          # max sagitta when flattening curves, in SVG units


def _ring_points(subpath):
    """Flatten one subpath to a point list."""
    pts = []
    for seg in subpath:
        length = 0.0
        try:
            length = seg.length(error=1e-3)
        except Exception:
            pass
        n = max(2, min(400, int(length / FLATNESS) + 2))
        for i in range(n + 1):
            p = seg.point(i / n)
            pts.append((p.x, p.y))
    # drop consecutive duplicates
    out = [pts[0]]
    for p in pts[1:]:
        if abs(p[0] - out[-1][0]) > 1e-9 or abs(p[1] - out[-1][1]) > 1e-9:
            out.append(p)
    return out


def _path_to_polygon(path):
    """One <path> -> shapely geometry, even-odd nesting for holes."""
    rings = []
    for sub in path.as_subpaths():
        pts = _ring_points(Path(sub))
        if len(pts) < 3:
            continue
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or poly.area < 1e-9:
            continue
        rings.append(poly)
    if not rings:
        return Polygon()
    # depth = how many other rings contain this one; odd depth = hole
    solids, holes = [], []
    for i, r in enumerate(rings):
        pt = r.representative_point()
        depth = sum(1 for j, o in enumerate(rings) if j != i and o.contains(pt))
        (holes if depth % 2 else solids).append(r)
    geom = unary_union(solids) if solids else Polygon()
    if holes:
        geom = geom.difference(unary_union(holes))
    return geom


def _hex_of(fill):
    if fill is None or getattr(fill, "value", None) is None:
        return "#000000"
    return "#%02x%02x%02x" % (fill.red, fill.green, fill.blue)


def load_svg_layers(svg_path, drop_background=True):
    """-> OrderedDict {colour_hex: shapely geometry}, y-up, painter's order applied."""
    svg = SVG.parse(svg_path)
    entries = []
    for el in svg.elements():
        if not isinstance(el, Shape):
            continue
        try:
            path = Path(el)
        except Exception:
            continue
        if len(path) == 0:
            continue
        fill = getattr(el, "fill", None)
        if fill is None or getattr(fill, "value", None) is None:
            continue        # unfilled (stroke-only) -- ignore
        geom = _path_to_polygon(path)
        if geom.is_empty or geom.area < 1e-9:
            continue
        entries.append((_hex_of(fill), geom))

    if drop_background and entries:
        # a first path covering essentially the whole canvas is the backdrop
        total = unary_union([g for _, g in entries])
        tminx, tminy, tmaxx, tmaxy = total.bounds
        canvas = (tmaxx - tminx) * (tmaxy - tminy)
        if entries[0][1].area > 0.95 * canvas:
            entries = entries[1:]

    layers = OrderedDict()
    for colour, geom in entries:
        for prev in layers:                    # painter's order
            if prev != colour:
                layers[prev] = layers[prev].difference(geom)
        layers[colour] = layers[colour].union(geom) if colour in layers else geom

    layers = OrderedDict((c, g) for c, g in layers.items()
                         if not g.is_empty and g.area > 1e-9)

    # flip to y-up and drop to origin
    allg = unary_union(list(layers.values()))
    minx, miny, maxx, maxy = allg.bounds
    for c in layers:
        g = aff.scale(layers[c], xfact=1, yfact=-1, origin=(0, 0))
        layers[c] = aff.translate(g, xoff=-minx, yoff=maxy)
    return layers


def fit_layers(layers, height=None, width=None, simplify_tol=0.02):
    """Uniformly scale a layer dict to a target height or width, origin at (0,0).

    `simplify_tol` is in final millimetres. Curves are flattened in SVG units,
    which for artwork drawn on a ~1700-unit canvas and printed 26 mm tall means
    chords far finer than any printer can resolve -- without this the meshes run
    to hundreds of thousands of degenerate facets and come out non-watertight.
    0.02 mm is well under a 0.4 mm nozzle's resolution, so nothing visible is
    lost.
    """
    allg = unary_union(list(layers.values()))
    minx, miny, maxx, maxy = allg.bounds
    w, h = maxx - minx, maxy - miny
    s = (height / h) if height else (width / w)
    out = OrderedDict()
    for c, g in layers.items():
        g = aff.translate(g, -minx, -miny)
        g = aff.scale(g, xfact=s, yfact=s, origin=(0, 0))
        if simplify_tol:
            g = g.simplify(simplify_tol, preserve_topology=True)
            if not g.is_valid:
                g = g.buffer(0)
        out[c] = g
    return out, w * s, h * s


def bounds_of(layers):
    return unary_union(list(layers.values())).bounds


if __name__ == "__main__":
    for f in ("chiang-mai-honda-logo-smooth.svg", "chiang-mai-honda-script.svg"):
        print(f"=== {f}")
        L = load_svg_layers(f)
        b = bounds_of(L)
        print(f"    bbox {b[2]-b[0]:.1f} x {b[3]-b[1]:.1f}  (aspect {(b[2]-b[0])/(b[3]-b[1]):.3f})")
        for c, g in L.items():
            print(f"    {c}  area {g.area:10.1f}  parts {len(g.geoms) if hasattr(g,'geoms') else 1}")
