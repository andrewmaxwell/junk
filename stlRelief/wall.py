# The whole wall as COLS x ROWS matching tiles, Clayton to the Arch, with dovetail tabs that lock neighbors
# together:   wall.py <out_dir> [tile names, e.g. D2]
# Heights are computed once for the whole wall, so every tile edge matches its neighbor. Tiles are named by
# column A.. (west to east) and row 1.. (north to south). Each tile has tabs on its east and south edges and
# matching slots on its west and north edges; tabs sit where the ground is lowest along the seam, away from
# tall buildings.
import numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relief, archflat
from relief import PXC
from terrace import terrace_solid
from manifold3d import CrossSection, Manifold, JoinType

M = 15                                     # meters per mm: 1:15,000
COLS, ROWS = 4, 2
N = 3266                                   # cells per tile edge: 244.95 mm
EAST_LON, MID_LAT = -90.175, 38.637        # east edge just past the Illinois bank; centered between Clayton and the Arch
NECK, HEAD, DEPTH = 6.0, 10.0, 5.0         # dovetail tab (mm): width at the seam, width at its end, how far it reaches
CLEAR = 0.15                               # gap around each tab, per side
MARGIN = 80                                # cells of the neighbor built with each tile (covers its tabs)
NX, NY = COLS * N + 1, ROWS * N + 1
T = N * PXC                                # tile size, mm
out = sys.argv[1]; which = sys.argv[2:]
os.makedirs(out, exist_ok=True)

hpath = f'{out}/heights.npy'
if os.path.exists(hpath):
    h = np.load(hpath, mmap_mode='r'); arch = json.load(open(f'{out}/arch.json'))
else:
    import math
    width_m = (NX - 1) * PXC * M
    lon = EAST_LON - width_m / 2 / (111320 * math.cos(math.radians(MID_LAT)))
    h, arch = relief.heights(lon, MID_LAT, M, NX, NY)
    np.save(hpath, h); arch = [float(a) for a in arch]; json.dump(arch, open(f'{out}/arch.json', 'w'))
    h = np.load(hpath, mmap_mode='r')
print(f'wall {NX * PXC:.0f} x {NY * PXC:.0f} mm, tiles {T:.2f} mm, heights {float(h.min()):.2f}..{float(h.max()):.2f} mm', flush=True)


def cells(x, y):  # print mm -> (row, col)
    return int(round(NY - 1 - y / PXC)), int(round(x / PXC))


def tab_at(seam, pos, vertical):
    """Tab polygon on a seam, belonging to the tile west of (or north of) it."""
    a, b, c = NECK / 2, HEAD / 2, DEPTH
    pts = [(-1, -a), (0, -a), (c, -b), (c, b), (0, a), (-1, a)]
    if vertical: return [(seam + u, pos + v) for u, v in pts]          # sticks out east
    return [(pos + v, seam - u) for u, v in pts]                        # sticks out south (a rotation, still counterclockwise)


def best_spots(seam, vertical, start):
    """Two spots along one tile's edge of a seam (one in each half) where the tab crosses the lowest ground,
    keeping off the thinnest floor (the river), which would make a flimsy tab. start: where that edge begins."""
    spots = []
    for lo, hi in ((0.15, 0.45), (0.55, 0.85)):
        best = None
        for p in np.arange(start + lo * T, start + hi * T, 1.0):
            # footprint across both sides of the seam
            if vertical: (r0, c0), (r1, c1) = cells(seam - DEPTH - 1, p + HEAD / 2 + 1), cells(seam + DEPTH + 1, p - HEAD / 2 - 1)
            else: (r0, c0), (r1, c1) = cells(p - HEAD / 2 - 1, seam + DEPTH + 1), cells(p + HEAD / 2 + 1, seam - DEPTH - 1)
            fp = h[r0:r1 + 1, c0:c1 + 1]
            score = float(fp.max()) + (10 if float(fp.min()) < 1.5 else 0)
            if best is None or score < best[0]: best = (score, round(float(p), 3))
        spots.append(best[1])
    return spots


def y0(j): return (ROWS - 1 - j) * T   # bottom (south) edge of row j


# tabs on the edge between tile (i, j) and its east neighbor, and between it and its south neighbor
east = {(i, j): best_spots((i + 1) * T, True, y0(j)) for i in range(COLS - 1) for j in range(ROWS)}
south = {(i, j): best_spots(y0(j), False, i * T) for i in range(COLS) for j in range(ROWS - 1)}
json.dump({'east': {f'{i},{j}': v for (i, j), v in east.items()}, 'south': {f'{i},{j}': v for (i, j), v in south.items()}},
          open(f'{out}/tabs.json', 'w'))


def shape(i, j):
    xa, xb = i * T, (i + 1) * T
    ya, yb = y0(j), y0(j) + T
    # on the wall's outer edges the model ends by itself; cutting there too would leave coplanar slivers
    x0, x1 = xa - (1 if i == 0 else 0), xb + (1 if i == COLS - 1 else 0)
    y_0, y_1 = ya - (1 if j == ROWS - 1 else 0), yb + (1 if j == 0 else 0)
    cs = CrossSection.square([x1 - x0, y_1 - y_0]).translate([x0, y_0])
    tabs = []
    if i < COLS - 1: tabs += [tab_at(xb, p, True) for p in east[i, j]]
    if j < ROWS - 1: tabs += [tab_at(ya, p, False) for p in south[i, j]]
    for t in tabs: cs = cs + CrossSection([np.array(t)])
    slots = []
    if i > 0: slots += [tab_at(xa, p, True) for p in east[i - 1, j]]
    if j > 0: slots += [tab_at(yb, p, False) for p in south[i, j - 1]]
    for s in slots: cs = cs - CrossSection([np.array(s)]).offset(CLEAR, JoinType.Miter)
    return cs


names = [f'{"ABCDEFGH"[i]}{j + 1}' for j in range(ROWS) for i in range(COLS)]
for name in which or names:
    i, j = 'ABCDEFGH'.index(name[0]), int(name[1:]) - 1
    c_lo, c_hi = max(0, i * N - MARGIN), min(NX - 1, (i + 1) * N + MARGIN)
    r_lo, r_hi = max(0, j * N - MARGIN), min(NY - 1, (j + 1) * N + MARGIN)
    sub = np.array(h[r_lo:r_hi + 1, c_lo:c_hi + 1], np.float64)
    model = terrace_solid(sub, PXC).translate([c_lo * PXC, (NY - 1 - r_hi) * PXC, 0])
    if i * N <= arch[0] < (i + 1) * N and j * N <= arch[1] < (j + 1) * N:
        model = relief.add_sockets(model, h, arch, M)
    model = model ^ shape(i, j).extrude(200).translate([0, 0, -1])
    relief.save(model, f'{out}/{name}.stl')
if not which or any(n == names[-1] for n in which):
    print('arch', archflat.write_stl(f'{out}/arch.stl', M, relief.BEXAG).round(2), 'mm')
