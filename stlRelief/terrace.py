# Build a height map as the stack of layers the printer will actually make, with straight walls:
# for each print layer, the pixels at or above that layer's height become one outline. Pixel staircases
# along building edges are simplified away (corners stay, since a corner is far off any straight line),
# and a wall that spans many layers gets the identical outline in every one, so it comes out vertical.
import numpy as np, shapely
from scipy import ndimage as nd
from manifold3d import CrossSection, FillRule, Manifold, OpType, JoinType

SQ = np.ones((3, 3), bool)
MIN_MM = 0.3   # features narrower than about this (rounded up to an odd number of cells) are opened away: the nozzle
               # can't print them, and Bambu reports such slivers as "floating regions"

def level_outline(mask, PX, eps_mm):
    """mask (rows north->south) -> CrossSection in mm, x east, y north; pixel (r,c) covers its square."""
    ny, nx = mask.shape
    d = np.diff(np.pad(mask.astype(np.int8), ((0, 0), (1, 1))), axis=1)
    rs, cs = np.nonzero(d == 1); _, ce = np.nonzero(d == -1)       # run starts/ends, row-major order
    x0 = (np.maximum(cs - 0.5, 0)) * PX; x1 = (np.minimum(ce - 0.5, nx - 1)) * PX
    yt = np.minimum((ny - 1 - rs + 0.5), ny - 1) * PX; yb = np.maximum((ny - 1 - rs - 0.5), 0) * PX
    rects = [np.array([[a, b], [c, b], [c, t], [a, t]]) for a, c, b, t in zip(x0, x1, yb, yt)]
    if not rects: return None
    rings = CrossSection(rects, FillRule.NonZero).to_polygons()
    # Douglas-Peucker: a straight edge's staircase strays at most ~0.7 px from the line, a real corner far more
    out = []
    for r in rings:
        if len(r) < 4: out.append(r); continue
        rr = np.r_[r, r[:1]]
        q = np.asarray(shapely.LineString(rr).simplify(eps_mm, preserve_topology=False).coords)[:-1]
        if len(q) >= 3: out.append(q)
    return CrossSection(out, FillRule.Positive) if out else None

def no_diagonals(m):
    """Pieces touching only corner to corner make a pinched (non-manifold) edge; fill one of the gaps."""
    m = m.copy()
    for _ in range(3):
        a, b, c, d = m[:-1, :-1], m[:-1, 1:], m[1:, :-1], m[1:, 1:]
        p1 = a & d & ~b & ~c; p2 = b & c & ~a & ~d
        if not (p1.any() or p2.any()): break
        m[:-1, 1:] |= p1; m[:-1, :-1] |= p2
    return m

def unpinch(cs, size=0.03):
    """Straightening and nesting can still leave two outlines meeting at one point; bridge each such
    point with a tiny square so the solid has no pinched edge."""
    for _ in range(4):
        rings = cs.to_polygons()
        if not rings: return cs
        pts = np.concatenate(rings)
        key = np.round(pts / 1e-5).astype(np.int64)
        _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True)
        dup = pts[np.flatnonzero(cnt[inv.ravel()] > 1)]
        if not len(dup): return cs
        dup = np.unique(np.round(dup, 5), axis=0)
        cs = CrossSection.batch_boolean([cs] + [CrossSection.square([size, size], True).translate(list(q)) for q in dup], OpType.Add)
    return cs

def terrace_solid(h, PX, first=0.2, dz=0.12, eps_mm=0.1, clean=True):
    top = float(h.max())
    tops = [first]
    while tops[-1] < top: tops.append(tops[-1] + dz)
    slabs, full, prev = [], None, None
    k_open = max(3, int(np.ceil(MIN_MM / PX)) | 1)   # odd window at least MIN_MM wide
    for k, zt in enumerate(tops):
        mask = h >= zt - dz / 2                    # a layer prints wherever the surface reaches its middle
        if mask.all():
            full = zt; continue
        if clean:   # a lone pixel sticking out or a one-pixel notch is noise; square corners survive this
            mask = nd.binary_closing(nd.binary_opening(mask, np.ones((k_open, k_open), bool)), SQ, border_value=1) & (h >= zt - dz / 2 - 0.3)
        mask = no_diagonals(mask)
        cs = level_outline(mask, PX, eps_mm)
        if cs is None or cs.is_empty(): break
        # every layer sits on the one below (straightening can nudge an edge out past it by a hair)
        if prev is not None: cs = cs ^ prev
        cs = unpinch(cs)
        prev = cs
        zb = tops[k - 1] if k else 0.0
        slabs.append(cs.extrude(zt - zb).translate([0, 0, zb]))
    ny, nx = h.shape
    base = CrossSection.square([(nx - 1) * PX, (ny - 1) * PX]).extrude(full)
    # merge anything closer than 1 micron, so the STL's rounding can't create pinches or gaps
    return Manifold.batch_boolean([base] + slabs, OpType.Add).simplify(0.001)
