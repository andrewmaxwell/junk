"""
Mesh helpers: turn 2D shapely regions into watertight solids.

Kept separate from the design so it has no dependency on the frame geometry.
Used by split.py (STL fallbacks) and export_3mf.py (the Bambu project).
"""
import trimesh
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

# Bambu Lab A1 build volume. (A1 mini would be 180.)
BED_X = BED_Y = BED_Z = 256.0


def as_polygons(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    # GeometryCollection: keep only the polygonal parts
    return [g for g in geom.geoms if isinstance(g, Polygon) and not g.is_empty]


MIN_AREA = 0.02      # mm^2 -- below this a feature cannot print; dropping such
                     # slivers avoids degenerate facets and non-watertight meshes

_dropped_area = 0.0


def dropped_area():
    """Total mm^2 discarded by clean_for_mesh() so far.

    Should be 0 for this design: since the artwork is embossed rather than
    inlaid, the white base is never booleaned against fine detail. split.py
    reports it so a regression shows up instead of quietly losing geometry.
    """
    return _dropped_area


def clean_for_mesh(geom, min_area=MIN_AREA):
    """Make a (Multi)Polygon safe to triangulate.

    Boolean differences against the fine SVG artwork leave microscopic slivers
    (the logo's stencil gaps produce dozens under 0.05 mm^2). Those triangulate
    into degenerate facets and make the mesh non-watertight, so they are dropped
    -- they are far below what a 0.4 mm nozzle can lay down anyway.
    """
    global _dropped_area
    if geom.is_empty:
        return geom
    keep = []
    for p in as_polygons(geom):
        if p.area < min_area:
            _dropped_area += p.area
            continue
        if not p.is_valid:
            p = p.buffer(0)
        for q in as_polygons(p):
            if q.area < min_area:
                _dropped_area += q.area
                continue
            rings = [r for r in q.interiors if Polygon(r).area >= min_area]
            keep.append(Polygon(q.exterior, rings)
                        if len(rings) != len(q.interiors) else q)
    return unary_union(keep) if keep else Polygon()


def _extrude_one(poly, height):
    """Extrude one polygon, guaranteeing a closed solid.

    trimesh's earcut triangulator does not reliably close a polygon carrying
    many holes -- the logo's red bar has 15 (the knocked-out "HONDA
    AUTOMOBILE" letters) and comes out open. When that happens, rebuild it as
    a boolean: extrude the outline, extrude the holes proud of it, subtract.
    """
    m = trimesh.creation.extrude_polygon(poly, height=height)
    m.merge_vertices()
    want = poly.area * height
    if m.is_watertight and abs(m.volume - want) <= 1e-4 * max(1.0, want):
        return m
    if not poly.interiors:
        return m
    solid = trimesh.creation.extrude_polygon(Polygon(poly.exterior), height=height)
    cutters = []
    for ring in poly.interiors:
        c = trimesh.creation.extrude_polygon(Polygon(ring), height=height + 2)
        c.apply_translation([0, 0, -1])
        cutters.append(c)
    cut = trimesh.util.concatenate(cutters) if len(cutters) > 1 else cutters[0]
    m2 = trimesh.boolean.difference([solid, cut], engine="manifold")
    m2.merge_vertices()
    return m2


def extrude(geom, height, base_z=0.0):
    """Extrude a (Multi)Polygon to a single watertight mesh, preserving XY.

    `base_z` lifts the solid, so embossed artwork can sit on top of the frame
    rather than being inlaid flush with it.
    """
    parts = []
    for p in as_polygons(clean_for_mesh(geom)):
        if p.area < 1e-6:
            continue
        if not p.is_valid:
            p = p.buffer(0)
            if p.is_empty:
                continue
        for q in as_polygons(p):
            parts.append(_extrude_one(q, height))
    if not parts:
        return None
    m = trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]
    m.merge_vertices()
    if base_z:
        m.apply_translation([0.0, 0.0, base_z])
    return m


Z_WELD = 0.01        # mm -- see extrude_layers()


def extrude_layers(specs):
    """specs: iterable of (geom, z_start, height) -> one merged watertight mesh.

    Spans stack: the script's descender runs full-depth from the bed while the
    rest of the artwork is embossed on top of the frame. Two solids meeting on a
    shared plane give the boolean coplanar faces, and it leaves a T-junction
    there -- correct volume, but a couple of non-manifold edges. Extending the
    lower solid Z_WELD into the upper one removes the coplanar pair and the union
    comes out clean. Z_WELD is a hundredth of a millimetre: far below one layer,
    and it lands inside the upper solid so it changes no surface.
    """
    specs = [(g, z0, h) for g, z0, h in specs
             if g is not None and not g.is_empty and h > 0]
    if not specs:
        return None
    starts = [z0 for _g, z0, _h in specs]
    parts = []
    for geom, z0, h in specs:
        weld = Z_WELD if any(abs(s - (z0 + h)) < 1e-6 for s in starts) else 0.0
        m = extrude(geom, h + weld, base_z=z0)
        if m is not None:
            parts.append(m)
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    m = trimesh.util.concatenate(parts)
    m.merge_vertices()
    if m.is_watertight:
        return m
    m = trimesh.boolean.union(parts, engine="manifold")
    m.merge_vertices()
    return m
