"""
Camera stand for photographing coffee grounds with a Canon R6 II and RF 100mm
F2.8L Macro, lit from below.

The camera stands lens-down with its hood resting on a ledge at the top of a
printed tower. A 77mm UV filter (the sample glass) sits in a carrier that
slides in through a slot and rests on three M3 screw tips. Turning the screws
levels the glass and moves it into focus, so the lens can stay at its minimum
focus distance (1.4x) and the scale never changes. A diffuser slides into a
second slot further down, and the light comes in through the windows at the
bottom.

Run with the repo's venv:  .venv/bin/python grindSize/stand/build_stand.py
Writes tower, carrier, diffuser and hood_fit_test STLs and preview.png next to this
file. All dimensions are mm. z = 0 is the print bed.
"""
import os

import numpy as np
import trimesh
from manifold3d import Manifold, set_circular_segments
from shapely.geometry import Polygon

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402
from matplotlib.path import Path as MplPath  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
set_circular_segments(256)

# ---------------- measured ----------------
HOOD_OD = 90.0  # lens hood outer diameter, flat front edge
HOOD_TO_FOCUS = 30.0  # hood front edge to focal plane at minimum focus
FILTER_OD = 80.0  # Kenko 77mm filter ring outer diameter
FILTER_H = 7.5  # total thickness at the edge

# ---------------- guessed: measure these ----------------
# The filter sits front side up so its rim walls in the grounds. Its male
# thread hangs below the wider ring, and the ring's lower face (the shoulder)
# rests on the carrier's ledge.
FILTER_THREAD_OD = 77.0
FILTER_THREAD_H = 3.0  # how far the male thread sticks out below the shoulder
GLASS_ABOVE_SHOULDER = 1.5  # top of the glass above the shoulder
# The screws cover about +-3 mm, so these guesses only need to be close.

# ---------------- design ----------------
CLEAR = 0.8  # diametral clearance for things that slide or drop in
FOCUS_ABOVE_GLASS = 0.15  # particle outlines sit a little above the glass

WALL = 5.0
BORE_D = 96.0  # tower bore below the collar
COLLAR_H = 25.0  # how far the collar rises around the hood, against tipping
HOOD_LEDGE_ID = 84.0  # the hood's rim rests on the ring between this and HOOD_OD

CARRIER_OD = 94.0
CARRIER_LEDGE_T = 2.5  # the filter's shoulder rests on this
CARRIER_WALL_H = 3.0  # pocket wall above the ledge, keeps the filter centered
TAB_W, TAB_L = 24.0, 18.0  # handle that sticks out of the slot

SCREW_R = 43.0  # radius of the three leveling screws
SCREW_ANGLES = (90, 210, 330)
TIP_NOMINAL = 3.0  # screw tip above the boss top at nominal focus
INSERT_D, INSERT_DEPTH = 4.1, 5.8  # M3 heat-set insert hole
SCREW_CLEAR_D = 3.4
COUNTERBORE_D = 7.4  # room below the boss for the screw head and a hex key
BOSS_W, BOSS_H = 10.0, 8.0

DIFFUSER_BELOW_GLASS = 35.0
DIFFUSER_SLOT_H = 4.0
DIFFUSER_LEDGE_ID = 82.0
DIFFUSER_T = 1.2  # printed diffuser disc, in white PETG
KEY_HOLE_D = 9.0

BASE_H = 30.0  # tower below the diffuser ledge, with windows for the light
WINDOW_W, WINDOW_Z = 50.0, (6.0, 22.0)
FOOT_D, FOOT_T = 150.0, 4.0

# ---------------- derived heights ----------------
OD = BORE_D + 2 * WALL
R_BORE = BORE_D / 2
Z_DIFFUSER = BASE_H  # top of the diffuser ledge
Z_GLASS = Z_DIFFUSER + DIFFUSER_BELOW_GLASS
Z_SHOULDER = Z_GLASS - GLASS_ABOVE_SHOULDER
Z_CARRIER = Z_SHOULDER - CARRIER_LEDGE_T  # carrier bottom = screw tips
Z_BOSS_TOP = Z_CARRIER - TIP_NOMINAL
Z_FOCUS = Z_GLASS + FOCUS_ABOVE_GLASS
Z_HOOD = Z_FOCUS + HOOD_TO_FOCUS  # where the hood's rim sits
Z_TOP = Z_HOOD + COLLAR_H
Z_FILTER_TOP = Z_SHOULDER + FILTER_H - FILTER_THREAD_H
SLOT_BOTTOM = Z_BOSS_TOP + 0.2
SLOT_TOP = Z_FILTER_TOP + TIP_NOMINAL + 3.0


def cyl(d, z0, z1, d_top=None):
    r = d / 2
    rt = r if d_top is None else d_top / 2
    return Manifold.cylinder(z1 - z0, r, rt).translate((0, 0, z0))


def box(x0, x1, y0, y1, z0, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def front_slot(z0, z1):
    """Opening through the front (-y) half of the wall, full bore width."""
    return box(-R_BORE, R_BORE, -OD, 0, z0, z1)


def tower():
    body = cyl(OD, 0, Z_TOP) - cyl(BORE_D, -1, Z_HOOD)
    body -= cyl(HOOD_OD + CLEAR, Z_HOOD, Z_TOP + 1)

    # Ledge the hood rests on, with a 45 degree underside so it prints.
    taper = R_BORE - HOOD_LEDGE_ID / 2
    ledge = cyl(BORE_D, Z_HOOD - 3, Z_HOOD) + cyl(BORE_D, Z_HOOD - 3 - taper, Z_HOOD - 3)
    ledge -= cyl(HOOD_LEDGE_ID, Z_HOOD - 4, Z_HOOD + 1)
    ledge -= cyl(BORE_D, Z_HOOD - 3 - taper, Z_HOOD - 3, HOOD_LEDGE_ID)
    body += ledge

    # Diffuser ledge, same idea.
    taper = R_BORE - DIFFUSER_LEDGE_ID / 2
    ledge = cyl(BORE_D, Z_DIFFUSER - 3 - taper, Z_DIFFUSER) - cyl(DIFFUSER_LEDGE_ID, 0, Z_DIFFUSER + 1)
    ledge -= cyl(BORE_D, Z_DIFFUSER - 3 - taper, Z_DIFFUSER - 3, DIFFUSER_LEDGE_ID)
    # Holes so a hex key can reach the leveling screws from below (diffuser out).
    for a in SCREW_ANGLES:
        ledge -= cyl(KEY_HOLE_D, 0, Z_DIFFUSER + 1).translate((SCREW_R, 0, 0)).rotate((0, 0, a))
    body += ledge

    # Screw bosses: a block under the carrier, tapering into the wall below.
    r_in = SCREW_R - BOSS_W / 2 - 1
    for a in SCREW_ANGLES:
        block = box(r_in, R_BORE + 1, -BOSS_W / 2, BOSS_W / 2, Z_BOSS_TOP - BOSS_H, Z_BOSS_TOP)
        foot = box(R_BORE - 0.5, R_BORE + 1, -BOSS_W / 2, BOSS_W / 2, Z_BOSS_TOP - BOSS_H - (R_BORE - r_in) - 1, Z_BOSS_TOP - BOSS_H)
        boss = Manifold.batch_hull([block, foot])
        boss -= cyl(INSERT_D, Z_BOSS_TOP - INSERT_DEPTH, Z_BOSS_TOP + 1).translate((SCREW_R, 0, 0))
        boss -= cyl(SCREW_CLEAR_D, 0, Z_BOSS_TOP).translate((SCREW_R, 0, 0))
        boss -= cyl(COUNTERBORE_D, 0, Z_BOSS_TOP - BOSS_H).translate((SCREW_R, 0, 0))
        body += boss.rotate((0, 0, a))

    body -= front_slot(SLOT_BOTTOM, SLOT_TOP)
    body -= front_slot(Z_DIFFUSER, Z_DIFFUSER + DIFFUSER_SLOT_H)

    for a in (90, 210, 330):
        w = box(0, OD, -WINDOW_W / 2, WINDOW_W / 2, *WINDOW_Z)
        body -= w.rotate((0, 0, a))

    foot = cyl(FOOT_D, 0, FOOT_T) - cyl(BORE_D, -1, FOOT_T + 1)
    return body + foot


def carrier():
    top = CARRIER_LEDGE_T + CARRIER_WALL_H
    c = cyl(CARRIER_OD, 0, top)
    c += box(-TAB_W / 2, TAB_W / 2, -CARRIER_OD / 2 - TAB_L, 0, 0, top)
    c -= cyl(FILTER_OD + CLEAR, CARRIER_LEDGE_T, top + 1)
    c -= cyl(FILTER_THREAD_OD + 1.0, -1, top + 1)
    return c


def diffuser():
    """Thin white disc that slides into the lower slot. Its print texture is far
    enough below the focal plane to blur away completely."""
    d = cyl(BORE_D - CLEAR - 1.0, 0, DIFFUSER_T)
    return d + box(-TAB_W / 2, TAB_W / 2, -BORE_D / 2 - TAB_L, 0, 0, DIFFUSER_T)


def hood_fit_test():
    """Just the top of the tower, to check the hood fit before the full print."""
    z0 = Z_HOOD - 3 - (R_BORE - HOOD_LEDGE_ID / 2)
    t = tower().translate((0, 0, -z0))
    return t ^ box(-OD, OD, -OD, OD, 0, Z_TOP - z0 - COLLAR_H + 8)


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


def preview(t, c, path):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 8))
    placed = c.translate((0, 0, Z_CARRIER))
    ax1.set_ylim(-5, Z_TOP + 10)
    for m, color in ((t, "#555"), (placed, "#c80")):
        # Rotate so the x = 0 plane becomes z = 0, then slice: points come back as (z, y).
        # Slice slightly off zero so the plane doesn't run exactly through cylinder vertices.
        contours = m.rotate((0, 90, 0)).slice(0.37).to_polygons()
        fill_contours(ax1, [pts[:, ::-1] for pts in contours], color)
    for z, label in ((Z_FOCUS, "focal plane"), (Z_HOOD, "hood rim"), (Z_GLASS, "glass top")):
        ax1.axhline(z, color="tab:blue", lw=0.6, ls="--")
        ax1.text(OD / 2 + 4, z, f"{label} {z:.1f}", va="center", fontsize=8, color="tab:blue")
    # Filter outline, front side up.
    fx = [-FILTER_OD / 2, FILTER_OD / 2, FILTER_OD / 2, FILTER_THREAD_OD / 2, FILTER_THREAD_OD / 2, -FILTER_THREAD_OD / 2, -FILTER_THREAD_OD / 2, -FILTER_OD / 2]
    fz = [Z_FILTER_TOP, Z_FILTER_TOP, Z_SHOULDER, Z_SHOULDER, Z_SHOULDER - FILTER_THREAD_H, Z_SHOULDER - FILTER_THREAD_H, Z_SHOULDER, Z_SHOULDER]
    ax1.plot(fx + fx[:1], fz + fz[:1], color="tab:green", lw=1)
    ax1.plot([-36, 36], [Z_GLASS, Z_GLASS], color="tab:green", lw=2)
    ax1.set_aspect("equal")
    ax1.set_title("Section through the middle (front = left). Grey tower, orange carrier, green filter")
    ax1.set_xlim(-OD / 2 - 45, OD / 2 + 50)

    z = Z_BOSS_TOP - 1
    fill_contours(ax2, t.slice(z).to_polygons(), "#555")
    for pts in c.slice(0.5).to_polygons():
        ax2.plot(*np.r_[pts, pts[:1]].T, color="#c80", lw=1)
    ax2.set_aspect("equal")
    ax2.set_title(f"Top view: tower at z = {z:.0f} (screw bosses), carrier outline in orange. Front = down")
    fig.tight_layout()
    fig.savefig(path, dpi=110)


if __name__ == "__main__":
    t, c = tower(), carrier()
    for name, m in (("tower", t), ("carrier", c), ("diffuser", diffuser()), ("hood_fit_test", hood_fit_test())):
        mesh = to_trimesh(m)
        mesh.export(os.path.join(HERE, f"{name}.stl"))
        lo, hi = mesh.bounds
        print(f"{name}.stl  {hi[0]-lo[0]:.0f} x {hi[1]-lo[1]:.0f} x {hi[2]-lo[2]:.0f} mm  watertight={mesh.is_watertight}  {mesh.volume/1000:.0f} cm3")
    preview(t, c, os.path.join(HERE, "preview.png"))
    print(f"glass {Z_GLASS:.1f}, carrier bottom {Z_CARRIER:.1f}, hood rim {Z_HOOD:.1f}, top {Z_TOP:.1f}")
    print(f"carrier slot {SLOT_BOTTOM:.1f}-{SLOT_TOP:.1f}, diffuser slot {Z_DIFFUSER:.1f}-{Z_DIFFUSER + DIFFUSER_SLOT_H:.1f}")
