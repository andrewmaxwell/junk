# The whole wall as COLS x ROWS matching tiles, Clayton to the Arch, with small dovetail tabs that lock
# neighbors together:   wall.py <out_dir> [tile names, e.g. D2]
# Heights are computed once for the whole wall, so every tile edge matches its neighbor. Tiles are named by
# column A.. (west to east) and row 1.. (north to south). Each tile has tabs on its east and south edges and
# matching slots on its west and north edges, the wall's outer edges included, so it can grow later. Tabs are
# thin plates along the bottom, tucked into pockets under the neighbor, so from the front a seam is just a
# straight line. They sit where the floor above the pocket is thickest (away from the river).
import numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relief, archflat
from relief import PXC
from terrace import terrace_solid
from manifold3d import CrossSection, Manifold, JoinType, FillRule

M = 16.384                                 # meters per mm: 1:16,384
COLS, ROWS = 4, 2
N = 3266                                   # cells per tile edge: 244.95 mm
MID_LON, MID_LAT = -90.2595, 38.637        # wall center: Clayton to just past East St. Louis's riverfront
NECK, HEAD, DEPTH = 4.0, 6.0, 3.0          # dovetail tab (mm): width at the seam, width at its end, how far it reaches
TAB_H, POCKET_H = 0.8, 0.92                # tab thickness, and the pocket it slides into (one layer taller)
CLEAR = 0.2                                # gap around each tab, per side (first layers squish out a little)
FLOOR_OK = 2.0                             # tile height (mm) that leaves a sturdy roof over a pocket
MARGIN = 80                                # cells of the neighbor built with each tile, so its edge is cut cleanly
NX, NY = COLS * N + 1, ROWS * N + 1
T = N * PXC                                # tile size, mm
out = sys.argv[1]; which = sys.argv[2:]
os.makedirs(out, exist_ok=True)

hpath = f'{out}/heights.npy'
if os.path.exists(hpath):
    h = np.load(hpath, mmap_mode='r'); arch = json.load(open(f'{out}/arch.json'))
else:
    h, arch = relief.heights(MID_LON, MID_LAT, M, NX, NY)
    np.save(hpath, h); arch = [float(a) for a in arch]; json.dump(arch, open(f'{out}/arch.json', 'w'))
    h = np.load(hpath, mmap_mode='r')
print(f'wall {NX * PXC:.0f} x {NY * PXC:.0f} mm, tiles {T:.2f} mm, heights {float(h.min()):.2f}..{float(h.max()):.2f} mm', flush=True)


def cells(x, y):  # print mm -> (row, col), clamped to the wall
    return min(max(int(round(NY - 1 - y / PXC)), 0), NY - 1), min(max(int(round(x / PXC)), 0), NX - 1)


def tab_at(seam, pos, vertical):
    """Tab polygon on a seam, belonging to the tile west of (or north of) it."""
    a, b, c = NECK / 2, HEAD / 2, DEPTH
    pts = [(-1, -a), (0, -a), (c, -b), (c, b), (0, a), (-1, a)]
    if vertical: return [(seam + u, pos + v) for u, v in pts]          # sticks out east
    return [(pos + v, seam - u) for u, v in pts]                        # sticks out south (a rotation, still counterclockwise)


def best_spots(seam, vertical, start):
    """Two spots along one tile's edge of a seam, one in each half, as near its middle as the floor allows: the
    river's thin floor would leave a flimsy roof over the pocket. start: where that edge begins."""
    spots = []
    for lo, hi in ((0.15, 0.45), (0.55, 0.85)):
        best, mid = None, start + (lo + hi) / 2 * T
        for p in np.arange(start + lo * T, start + hi * T, 1.0):
            # footprint across both sides of the seam
            if vertical: (r0, c0), (r1, c1) = cells(seam - DEPTH - 1, p + HEAD / 2 + 1), cells(seam + DEPTH + 1, p - HEAD / 2 - 1)
            else: (r0, c0), (r1, c1) = cells(p - HEAD / 2 - 1, seam + DEPTH + 1), cells(p + HEAD / 2 + 1, seam - DEPTH - 1)
            fp = h[r0:r1 + 1, c0:c1 + 1]
            score = (-min(float(fp.min()), FLOOR_OK), abs(p - mid))
            if best is None or score < best[0]: best = (score, round(float(p), 3))
        spots.append(best[1])
    return spots


def y0(j): return (ROWS - 1 - j) * T   # bottom (south) edge of row j


# tabs on tile (i, j)'s east and south edges (i = -1 or j = -1: the slots on the wall's west and north edges)
east = {(i, j): best_spots((i + 1) * T, True, y0(j)) for i in range(-1, COLS) for j in range(ROWS)}
south = {(i, j): best_spots(y0(j), False, i * T) for i in range(COLS) for j in range(-1, ROWS)}
json.dump({'east': {f'{i},{j}': v for (i, j), v in east.items()}, 'south': {f'{i},{j}': v for (i, j), v in south.items()}},
          open(f'{out}/tabs.json', 'w'))


def shape(i, j):
    xa, xb = i * T, (i + 1) * T
    ya, yb = y0(j), y0(j) + T
    # on the wall's outer edges the model ends by itself; cutting there too would leave coplanar slivers
    x0, x1 = xa - (1 if i == 0 else 0), xb + (1 if i == COLS - 1 else 0)
    y_0, y_1 = ya - (1 if j == ROWS - 1 else 0), yb + (1 if j == 0 else 0)
    sq = CrossSection.square([x1 - x0, y_1 - y_0]).translate([x0, y_0])
    tabs = [tab_at(xb, p, True) for p in east[i, j]] + [tab_at(ya, p, False) for p in south[i, j]]
    slots = [tab_at(xa, p, True) for p in east[i - 1, j]] + [tab_at(yb, p, False) for p in south[i, j - 1]]
    tabs = CrossSection([np.array(t) for t in tabs], FillRule.NonZero)
    slots = CrossSection([np.array(t) for t in slots], FillRule.NonZero).offset(CLEAR, JoinType.Miter)
    return sq, tabs, slots


names = [f'{"ABCDEFGH"[i]}{j + 1}' for j in range(ROWS) for i in range(COLS)]
for name in which or names:
    i, j = 'ABCDEFGH'.index(name[0]), int(name[1:]) - 1
    c_lo, c_hi = max(0, i * N - MARGIN), min(NX - 1, (i + 1) * N + MARGIN)
    r_lo, r_hi = max(0, j * N - MARGIN), min(NY - 1, (j + 1) * N + MARGIN)
    sub = np.array(h[r_lo:r_hi + 1, c_lo:c_hi + 1], np.float64)
    model = terrace_solid(sub, PXC).translate([c_lo * PXC, (NY - 1 - r_hi) * PXC, 0])
    if i * N <= arch[0] < (i + 1) * N and j * N <= arch[1] < (j + 1) * N:
        model = relief.add_sockets(model, h, arch, M)
    sq, tabs, slots = shape(i, j)
    model = (model ^ sq.extrude(200).translate([0, 0, -1])) + tabs.extrude(TAB_H) - slots.extrude(POCKET_H + 1).translate([0, 0, -1])
    relief.save(model, f'{out}/{name}.stl')
if not which or any(n == names[-1] for n in which):
    print('arch', archflat.write_stl(f'{out}/arch.stl', M, relief.BEXAG).round(2), 'mm')
