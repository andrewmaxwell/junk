"""
Shared helpers: text -> polygon, rounded rectangles, and the multi-colour
preview renderer. Millimetres, shapely (Multi)Polygons, y-up.
"""
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
import shapely.affinity as aff
from matplotlib.font_manager import FontProperties
from matplotlib.patches import PathPatch
from matplotlib.path import Path
from matplotlib.textpath import TextPath

import os

def _find_font(candidates):
    """First existing path from `candidates`, else matplotlib's bundled DejaVu.

    Liberation Sans (Linux) and Arial (macOS) are metrically identical, so the
    design renders the same on either. DejaVu is a last-resort fallback and is
    wider -- check the width numbers printed by build_frame.py if it is used.
    """
    for p in candidates:
        if os.path.exists(p):
            return p
    import matplotlib
    fallback = os.path.join(os.path.dirname(matplotlib.__file__),
                            "mpl-data", "fonts", "ttf", candidates[-1])
    return fallback

FONT_BOLD = _find_font([
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "DejaVuSans-Bold.ttf",
])

_CAPHEIGHT_CACHE = {}

def _cap_height_units(ttf_path, size=1000):
    """Reference cap height (in TextPath output units) for a font at a given size."""
    key = (ttf_path, size)
    if key not in _CAPHEIGHT_CACHE:
        p = TextPath((0, 0), "H", size=size, prop=FontProperties(fname=ttf_path))
        v = p.vertices
        _CAPHEIGHT_CACHE[key] = v[:, 1].max() - v[:, 1].min()
    return _CAPHEIGHT_CACHE[key]

def text_polygon(text, ttf_path, cap_height_mm, tracking=1.0):
    """
    Render `text` in the given font, scaled so a capital letter is exactly
    cap_height_mm tall. Baseline sits at y=0, left edge of first glyph at x=0.
    Returns a shapely (Multi)Polygon (holes handled via even-odd winding).
    tracking: >1.0 spaces letters out slightly, <1.0 tightens.
    """
    size = 1000.0
    path = TextPath((0, 0), text, size=size, prop=FontProperties(fname=ttf_path))
    polys_raw = path.to_polygons()
    scale = cap_height_mm / _cap_height_units(ttf_path, size)

    outers, holes = [], []
    for pts in polys_raw:
        if len(pts) < 3:
            continue
        area = 0.0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            area += x1 * y2 - x2 * y1
        area *= 0.5
        poly = Polygon(pts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if area < 0:
            outers.append(poly)
        else:
            holes.append(poly)

    if not outers:
        return Polygon()
    result = unary_union(outers)
    if holes:
        result = result.difference(unary_union(holes))

    if tracking != 1.0:
        result = aff.scale(result, xfact=tracking, yfact=1.0, origin=(0, 0))
    result = aff.scale(result, xfact=scale, yfact=scale, origin=(0, 0))
    return result

def rounded_rect(x0, y0, x1, y1, r, res=24):
    if r <= 0:
        return box(x0, y0, x1, y1)
    return box(x0 + r, y0 + r, x1 - r, y1 - r).buffer(r, quad_segs=res, join_style=1)

def geom_to_mpl_path(geom):
    """Convert a shapely (Multi)Polygon into a single matplotlib compound Path
    (even-odd fill), so holes and adjacent polygons render with no seams."""
    verts, codes = [], []
    geoms = geom.geoms if hasattr(geom, "geoms") else [geom]
    for g in geoms:
        if g.is_empty:
            continue
        rings = [g.exterior] + list(g.interiors)
        for ring in rings:
            pts = list(ring.coords)
            verts.extend(pts)
            codes.append(Path.MOVETO)
            codes.extend([Path.LINETO] * (len(pts) - 2))
            codes.append(Path.CLOSEPOLY)
    if not verts:
        return None
    return Path(verts, codes)

def plot_layers(ax, layers, bg="#f2f2f2"):
    """layers: list of (shapely geometry, color) drawn in order."""
    ax.set_facecolor(bg)
    for geom, color in layers:
        if geom is None or geom.is_empty:
            continue
        path = geom_to_mpl_path(geom)
        if path is None:
            continue
        patch = PathPatch(path, facecolor=color, edgecolor=color, lw=0.4, joinstyle='round')
        ax.add_patch(patch)
    ax.set_aspect('equal')
    ax.axis('off')
    ax.autoscale_view()
