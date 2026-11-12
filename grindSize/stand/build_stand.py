"""
Camera stand for photographing coffee grounds with a Canon R6 II and RF 100mm
F2.8L Macro, lit from below. No hardware: every part is printed.

    sleeve     fits over the lens hood. The hood's front edge seats on a ledge,
               and slotted spring fingers with a small lip grip the hood.
               Below the ledge is a tube with a coarse external thread.
    barrel     threads onto the sleeve's tube. A 77mm UV filter (the sample
               glass) sits in a carrier that slides in through a slot and drops
               onto a ring at the bottom of the barrel. Turning the barrel moves
               the glass into focus, so the lens stays at its minimum focus
               distance (1.4x) and the scale never changes.
    lock ring  runs down the tube against the top of the barrel and jams it,
               which also takes up the thread's play the same way every time.

The bottom is open and points at an evenly lit white surface, the backlight.

Run with the repo's venv:  .venv/bin/python grindSize/stand/build_stand.py
Writes grind_stand.3mf (a Bambu Studio project, see export_3mf.py) and
preview.png next to this file. All dimensions are mm. Heights are in the
barrel's frame: z = 0 is its bottom, with the barrel at the middle of its travel.
"""
import math
import os

import numpy as np
import trimesh
from manifold3d import CrossSection, Manifold, set_circular_segments
from shapely.geometry import Polygon

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402

import export_3mf  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SEGMENTS = 256
set_circular_segments(SEGMENTS)

# ---------------- measured ----------------
HOOD_OD = 90.0  # lens hood outer diameter, flat front edge
# Hood front edge to the focal plane at minimum focus (1.42x, checked with a
# dime). Bracketed by the prints so far: the first stand put the glass 33 mm
# down and that was too close; the second couldn't come up past 40.5 mm and
# that was too far. The barrel's travel covers +-TRAVEL around this.
HOOD_TO_FOCUS = 38.0
FILTER_OD = 80.0  # Kenko 77mm filter ring outer diameter
FILTER_H = 7.5  # total thickness at the edge

# ---------------- guessed ----------------
# The filter sits front side up so its rim walls in the grounds. Its male
# thread hangs below the wider ring, and the ring's lower face (the shoulder)
# rests on the carrier's ledge. The barrel's travel covers these guesses too.
FILTER_THREAD_OD = 77.0
FILTER_THREAD_H = 3.0  # how far the male thread sticks out below the shoulder
GLASS_ABOVE_SHOULDER = 1.5  # top of the glass above the shoulder

# ---------------- design ----------------
CLEAR = 0.8  # diametral clearance for things that slide or drop in
# The hood collar. A fit test at 0.8 fit the hood with a little play, and one
# at -0.2 only just went on. The fingers' lip does the gripping.
HOOD_CLEAR = 0.3
FOCUS_ABOVE_GLASS = 0.15  # particle outlines sit a little above the glass

COLLAR_H = 18.0  # how far the collar rises around the hood; the ledge, not the collar, keeps it square
COLLAR_WALL = 2.2  # stays inside the tube thread root, so the lock ring passes it
FINGERS, SLIT_W, SLIT_DEPTH = 12, 2.0, 13.0
LIP_D = HOOD_OD - 0.7  # the fingers' lip squeezes the hood this tight
LIP_H = 3.0  # lip height, with 45 degree ramps above and below
HOOD_LEDGE_ID = 84.0  # the hood's rim rests on the ring between this and the collar

# The focusing thread: one start, 3 mm per turn, trapezoidal with ~45 degree
# flanks so both the external and internal threads print without supports.
PITCH = 3.0
THREAD_DEPTH = 1.0
THREAD_CLEAR = 0.25  # radial, between the tube and the barrel or lock ring
TUBE_ROOT_D = 96.0  # the sleeve tube's thread root; its crest is 2 mm wider
TUBE_ID = 92.0  # 2 mm of wall under the thread root
TRAVEL = 4.0  # the barrel can move this far either way from the middle

BARREL_OD = 102.0  # 1.75-2.75 mm of wall around the internal thread
BORE_D = 96.0  # barrel bore around the carrier
RING_T = 2.0  # the ring at the bottom of the barrel that the carrier rests on
RING_ID = 86.0  # passes the filter's male thread
CARRIER_OD = 94.0
CARRIER_LEDGE_T = 1.8  # the filter's shoulder rests on this
CARRIER_WALL_H = 2.5  # pocket wall above the ledge, keeps the filter centered
TAB_W, TAB_L = 24.0, 18.0  # handle that sticks out of the slot
LIFT = 3.5  # the carrier slides in this high, so the filter's thread clears the ring, then drops

LOCK_H = 4.0
LOCK_OD = 106.0
LOCK_GRIPS = 24  # notches around the lock ring for fingers

# The wall above the carrier slot is a half circle held only at its ends, which
# a slicer can't bridge. Thin radial ribs turn it into short bridges; snap them
# out with pliers after printing.
RIB_T, RIB_STEP = 0.8, 10.0  # thickness, and spacing in degrees

# ---------------- derived heights (barrel frame) ----------------
R_BORE = BORE_D / 2
R_ROOT = TUBE_ROOT_D / 2
Z_CARRIER = RING_T  # carrier bottom
Z_SHOULDER = Z_CARRIER + CARRIER_LEDGE_T
Z_GLASS = Z_SHOULDER + GLASS_ABOVE_SHOULDER
Z_FOCUS = Z_GLASS + FOCUS_ABOVE_GLASS
Z_FILTER_TOP = Z_SHOULDER + FILTER_H - FILTER_THREAD_H
SLOT_BOTTOM = RING_T
SLOT_TOP = Z_FILTER_TOP + LIFT + 1.0
Z_BARREL_THREAD = SLOT_TOP  # the wall over the slot is threaded too
Z_HOOD = Z_FOCUS + HOOD_TO_FOCUS  # where the hood's rim sits
# With the barrel all the way up, the tube's bottom must still be inside the
# barrel's thread (below it the bore is too narrow for the tube's crest; the
# second print stopped 2.5 mm short of its travel because of this) and above
# the slot. With it all the way down, the lock ring must fit between the barrel
# and the collar.
Z_TUBE_BOTTOM = Z_BARREL_THREAD + TRAVEL + 0.5
Z_BARREL_TOP = Z_HOOD - TRAVEL - LOCK_H - 1.0
Z_TOP = Z_HOOD + COLLAR_H
assert Z_BARREL_TOP - Z_BARREL_THREAD > 15, "barrel thread too short"
ENGAGE_MIN = Z_BARREL_TOP - (Z_TUBE_BOTTOM + TRAVEL)
assert ENGAGE_MIN > 10, f"only {ENGAGE_MIN:.1f} mm of thread engaged at the bottom of travel"


def cyl(d, z0, z1, d_top=None):
    r = d / 2
    rt = r if d_top is None else d_top / 2
    return Manifold.cylinder(z1 - z0, r, rt).translate((0, 0, z0))


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def revolved(profile):
    """Solid of revolution from (r, z) points."""
    return Manifold.revolve(CrossSection([profile]), SEGMENTS)


def thread(r_root, z0, z1, grow=0.0):
    """External thread solid, PITCH per turn. Its cross section at any height is
    one crest and one root around the circle, and twisting that one full turn
    per pitch makes the helix. grow widens it all round, so the same solid
    subtracted from a part leaves a matching internal thread with clearance."""
    n = 120  # points around; each extrusion step turns by exactly one, so the
    # facets follow the helix instead of zigzagging across the flanks
    pts = []
    for i in range(n):
        u = i / n  # crest 0-0.15, flank, root 0.5-0.65, flank
        if u < 0.15:
            h = 1.0
        elif u < 0.5:
            h = 1 - (u - 0.15) / 0.35
        elif u < 0.65:
            h = 0.0
        else:
            h = (u - 0.65) / 0.35
        r = r_root + grow + THREAD_DEPTH * h
        t = 2 * math.pi * u
        pts.append((r * math.cos(t), r * math.sin(t)))
    height = z1 - z0
    turns = height / PITCH
    steps = max(1, round(turns * n))
    turns = steps / n
    height = turns * PITCH
    # Positive twist turns the crest counterclockwise (seen from above) as it
    # rises: a right-hand thread, so the barrel tightens clockwise seen from below.
    return Manifold.extrude(CrossSection([pts]), height, steps - 1, 360 * turns).translate((0, 0, z0))


def front_slot(z0, z1):
    """Opening through the front (-y) half of the wall, full bore width."""
    return box(-R_BORE, R_BORE, -BARREL_OD, 0, z0, z1)


def sleeve():
    """In the barrel frame at mid travel. Prints tube end down."""
    # The pieces overlap rather than meet exactly, which keeps the mesh clean.
    # The collar stands on the tube's wall, inside its thread root, so the lock
    # ring can run the tube's whole length.
    tube = thread(R_ROOT, Z_TUBE_BOTTOM, Z_HOOD - 0.25) - cyl(TUBE_ID, Z_TUBE_BOTTOM - 1, Z_HOOD)
    ri, ro, lip = (HOOD_OD + HOOD_CLEAR) / 2, (HOOD_OD + HOOD_CLEAR) / 2 + COLLAR_WALL, LIP_D / 2
    assert ro < R_ROOT
    # Ledge the hood rests on, with a 45 degree underside that ends inside the
    # tube's wall. It also carries the collar, whose bore is narrower than the tube's.
    r_in, r_slope = HOOD_LEDGE_ID / 2, TUBE_ID / 2 + 0.3
    r_out = r_slope + 0.5
    assert r_in < ri < r_out < R_ROOT
    z_slope = Z_HOOD - 2 - (r_slope - r_in)
    ledge = revolved([(r_in, Z_HOOD), (r_in, Z_HOOD - 2), (r_slope, z_slope), (r_out, z_slope), (r_out, Z_HOOD)])
    # Collar with spring fingers: straight bore, then a lip that squeezes the
    # hood, with 45 degree ramps so it prints and the hood pushes past it.
    z_lip = Z_TOP - 1.0 - (ri - lip)  # top of the lip's flat
    collar = revolved([
        (ri, Z_HOOD - 0.5), (ro, Z_HOOD - 0.5), (ro, Z_TOP), (ri, Z_TOP),
        (lip, z_lip), (lip, z_lip - LIP_H), (ri, z_lip - LIP_H - (ri - lip)),
    ])
    for i in range(FINGERS):
        slit = box(ri - 1, ro + 1, -SLIT_W / 2, SLIT_W / 2, Z_TOP - SLIT_DEPTH, Z_TOP + 1)
        collar -= slit.rotate((0, 0, 360 * (i + 0.5) / FINGERS))
    return tube + ledge + collar


def barrel():
    body = cyl(BARREL_OD, 0, Z_BARREL_TOP) - cyl(BORE_D, RING_T, Z_BARREL_TOP + 1)
    body -= cyl(RING_ID, -1, RING_T + 1)
    body -= thread(R_ROOT, Z_BARREL_THREAD, Z_BARREL_TOP + 1, THREAD_CLEAR)
    body -= front_slot(SLOT_BOTTOM, SLOT_TOP)
    for a in np.arange(180 + RIB_STEP / 2, 360, RIB_STEP):
        body += box(R_BORE - 0.5, BARREL_OD / 2, -RIB_T / 2, RIB_T / 2, SLOT_BOTTOM - 0.5, SLOT_TOP + 0.5).rotate((0, 0, float(a)))
    return body


def carrier():
    top = CARRIER_LEDGE_T + CARRIER_WALL_H
    c = cyl(CARRIER_OD, 0, top)
    c += box(-TAB_W / 2, TAB_W / 2, -CARRIER_OD / 2 - TAB_L, 0, 0, top)
    c -= cyl(FILTER_OD + CLEAR, CARRIER_LEDGE_T, top + 1)
    c -= cyl(FILTER_THREAD_OD + 1.0, -1, top + 1)
    return c


def lock_ring():
    ring = cyl(LOCK_OD, 0, LOCK_H) - thread(R_ROOT, -1, LOCK_H + 1, THREAD_CLEAR)
    for i in range(LOCK_GRIPS):
        ring -= cyl(4, -1, LOCK_H + 1).translate((LOCK_OD / 2 + 0.6, 0, 0)).rotate((0, 0, 360 * i / LOCK_GRIPS))
    return ring


def overhangs(mesh, bridges=()):
    """Area (mm2) of downward faces steeper than 50 degrees from vertical that
    aren't on the bed or at one of the intended bridge heights. The second
    print's ledge turned to spaghetti because a flat one slipped through."""
    n, c = mesh.face_normals, mesh.triangles_center
    bad = (n[:, 2] < -math.sin(math.radians(50))) & (c[:, 2] > 0.1)
    for z in bridges:
        bad &= np.abs(c[:, 2] - z) > 0.3
    return mesh.area_faces[bad].sum()


def to_trimesh(m):
    mesh = m.to_mesh()
    return trimesh.Trimesh(mesh.vert_properties[:, :3], mesh.tri_verts, process=True)


def fill_contours(ax, contours, color):
    """Fill a slice's contours by the even-odd rule, so holes stay open."""
    region = Polygon()
    for pts in contours:
        region = region.symmetric_difference(Polygon(pts).buffer(0))
    for poly in getattr(region, "geoms", [region]):
        ax.add_patch(PathPatch(MplPath.make_compound_path(*[MplPath(np.asarray(ring.coords)) for ring in (poly.exterior, *poly.interiors)]), color=color, alpha=0.85, lw=0))


def section(ax, m, color):
    # Rotate so the x = 0 plane becomes z = 0, then slice: points come back as (z, y).
    # Slice slightly off zero so the plane doesn't run exactly through vertices.
    contours = m.rotate((0, 90, 0)).slice(0.37).to_polygons()
    fill_contours(ax, [pts[:, ::-1] for pts in contours], color)


def preview(parts, path):
    s, b, c, lr = parts
    fig, ax = plt.subplots(figsize=(10, 9))
    for m, color in ((s, "#555"), (b, "#999"), (c.translate((0, 0, Z_CARRIER)), "#c80"), (lr.translate((0, 0, Z_BARREL_TOP + 0.5)), "#a33")):
        section(ax, m, color)
    for z, label in ((Z_FOCUS, "focal plane"), (Z_HOOD, "hood rim")):
        ax.axhline(z, color="tab:blue", lw=0.6, ls="--")
        ax.text(BARREL_OD / 2 + 10, z, f"{label} {z:.1f}", va="center", fontsize=8, color="tab:blue")
    fx = [-FILTER_OD / 2, FILTER_OD / 2, FILTER_OD / 2, FILTER_THREAD_OD / 2, FILTER_THREAD_OD / 2, -FILTER_THREAD_OD / 2, -FILTER_THREAD_OD / 2, -FILTER_OD / 2]
    fz = [Z_FILTER_TOP, Z_FILTER_TOP, Z_SHOULDER, Z_SHOULDER, Z_SHOULDER - FILTER_THREAD_H, Z_SHOULDER - FILTER_THREAD_H, Z_SHOULDER, Z_SHOULDER]
    ax.plot(fx + fx[:1], fz + fz[:1], color="tab:green", lw=1)
    ax.plot([-36, 36], [Z_GLASS, Z_GLASS], color="tab:green", lw=2)
    ax.set_aspect("equal")
    ax.set_xlim(-BARREL_OD / 2 - 30, BARREL_OD / 2 + 45)
    ax.set_ylim(-8, Z_TOP + 8)
    ax.set_title("Section through the middle (front = left), barrel at mid travel\n"
                 "dark grey sleeve, light grey barrel, red lock ring, orange carrier, green filter")
    fig.tight_layout()
    fig.savefig(path, dpi=110)


def on_bed(m):
    """Drop a part so its lowest point is on the bed."""
    return m.translate((0, 0, -m.bounding_box()[2]))


def centered(mesh, x=128, y=128):
    """Bed position that centers a mesh at (x, y)."""
    lo, hi = mesh.bounds
    return x - (lo[0] + hi[0]) / 2, y - (lo[1] + hi[1]) / 2


def gap(a, pa, b, pb):
    """Clearance between two bed placements, using their xy bounding circles."""
    def circle(m, p):
        c = m.bounds[:, :2].mean(0)
        return np.add(p, c), np.max(np.hypot(*(m.vertices[:, :2] - c).T))
    (ca, ra), (cb, rb) = circle(a, pa), circle(b, pb)
    return np.hypot(*(ca - cb)) - ra - rb


if __name__ == "__main__":
    parts = sleeve(), barrel(), carrier(), lock_ring()
    names = ("sleeve", "barrel", "carrier", "lock ring")
    meshes = {n: to_trimesh(on_bed(m)) for n, m in zip(names, parts)}
    for name, mesh in meshes.items():
        lo, hi = mesh.bounds
        bad = overhangs(mesh, [SLOT_TOP] if name == "barrel" else [])
        print(f"{name:10s} {hi[0]-lo[0]:.0f} x {hi[1]-lo[1]:.0f} x {hi[2]-lo[2]:.0f} mm  watertight={mesh.is_watertight}  "
              f"{mesh.volume/1000:.0f} cm3  overhangs {bad:.1f} mm2")
        assert mesh.is_watertight and bad < 1, name

    # Parts already printed and unchanged go on a plate of their own, so
    # they're easy to skip. The carrier hasn't changed since the second print.
    new = {"sleeve": centered(meshes["sleeve"], 56, 200), "barrel": centered(meshes["barrel"], 199, 199),
           "lock ring": centered(meshes["lock ring"], 128, 58)}
    ks = list(new)
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            g = gap(meshes[ks[i]], new[ks[i]], meshes[ks[j]], new[ks[j]])
            print(f"  {ks[i]} to {ks[j]}: {g:.1f} mm")
            assert g > 5

    export_3mf.write(
        os.path.join(HERE, "grind_stand.3mf"),
        [
            ("1 sleeve, barrel and lock ring", [(n, meshes[n], "black", xy) for n, xy in new.items()]),
            ("2 carrier (unchanged, skip if you have one)", [("carrier", meshes["carrier"], "black", centered(meshes["carrier"]))]),
        ],
    )
    preview(parts, os.path.join(HERE, "preview.png"))
    print(f"glass {Z_GLASS:.1f}, focus {Z_FOCUS:.1f}, hood rim {Z_HOOD:.1f}, top {Z_TOP:.1f}")
    print(f"slot {SLOT_BOTTOM:.1f}-{SLOT_TOP:.1f}, barrel thread {Z_BARREL_THREAD:.1f}-{Z_BARREL_TOP:.1f}, tube {Z_TUBE_BOTTOM:.1f}-{Z_HOOD:.1f}")
    print(f"focus range {HOOD_TO_FOCUS - TRAVEL:.0f}-{HOOD_TO_FOCUS + TRAVEL:.0f} mm below the hood rim, "
          f"{TRAVEL * 2 / PITCH:.1f} turns; thread engaged {ENGAGE_MIN:.1f}-{ENGAGE_MIN + 2 * TRAVEL:.1f} mm")
