# One printable tile straight from the USGS lidar point cloud, centered on a point:
#   tile.py <lon> <lat> <m_per_mm> <width_mm> <height_mm> <out_dir>
# Writes <out_dir>/tile.stl (with sockets for the Arch's legs) and <out_dir>/arch.stl (the Arch, printed
# lying flat). Surface = highest return per half-print-pixel cell; the mesh is one straightened outline per
# print layer (terrace.py), so walls come out vertical with sharp corners.
import numpy as np, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy import ndimage as nd
from concurrent.futures import ThreadPoolExecutor
from ept import EPT, merc
import archflat, trimesh
from manifold3d import Manifold, Mesh
PX = float(os.environ.get('PX', 0.15))
BASE, ZMIN = 1.04, 115.83                      # floor thickness at the river, and the river's level (m)
EXAG = float(os.environ.get('EXAG', 1.0))      # ground relief: 1 = true scale
BEXAG = float(os.environ.get('BEXAG', 1.0))    # buildings, trees and the Arch: 1 = true height
GROUND_M = float(os.environ.get('GROUND_M', 2.5))  # anything lower than this above the ground is street
CLUTTER = int(os.environ.get('CLUTTER', 7))       # rooftop bumps/pits narrower than this many cells...
BUMP_M = float(os.environ.get('BUMP_M', 4.0))     # ...and shorter/shallower than this (m) are leveled
DTM_SIGMA = float(os.environ.get('DTM_SIGMA', 1.0))  # ground model smoothing, in 5-cell blocks
lon, lat, M, Wmm, Hmm, out = *map(float, sys.argv[1:6]), sys.argv[6]
os.makedirs(out, exist_ok=True)
k = math.cos(math.radians(lat)); cx, cy = merc(lon, lat)
CELL = PX * M / 2                              # true meters per cell
nx, ny = int(round(Wmm / PX)) * 2 + 2, int(round(Hmm / PX)) * 2 + 2
x0, y1 = cx - nx * CELL / 2 / k, cy + ny * CELL / 2 / k   # mercator corner (west, north)
x1, y0 = x0 + nx * CELL / k, y1 - ny * CELL / k
top = np.full(ny * nx, -np.inf, np.float32); gnd = np.full(ny * nx, np.inf, np.float32)
e = EPT('USGS_LPC_MO_StLouis_2017_LAS_2018')
def load(key):
    x, y, z, cl = e.read(key)
    ix = np.floor((x - x0) * k / CELL).astype(np.int64); iy = np.floor((y1 - y) * k / CELL).astype(np.int64)
    m = (ix >= 0) & (ix < nx) & (iy >= 0) & (iy < ny)
    return iy[m] * nx + ix[m], z[m].astype(np.float32), cl[m]
with ThreadPoolExecutor(16) as ex:
    for idx, z, cl in ex.map(load, list(e.nodes((x0, y0, x1, y1), 40))):
        keep = ~np.isin(cl, (7, 18, 9))
        np.maximum.at(top, idx[keep], z[keep])
        g = cl == 2; np.minimum.at(gnd, idx[g], z[g])
top, gnd = top.reshape(ny, nx), gnd.reshape(ny, nx)
print(f'cell {CELL:.2f} m, {np.isfinite(top).mean():.1%} of cells have a return')
# ground: 5-cell block minimum, holes from the nearest ground, lightly smoothed
B = 5; hb, wb = ny // B, nx // B
g = np.where(np.isfinite(gnd), gnd, np.nan)[:hb * B, :wb * B].reshape(hb, B, wb, B)
with np.errstate(all='ignore'): g = np.nanmin(g, axis=(1, 3))
bad = np.isnan(g); g = g[tuple(nd.distance_transform_edt(bad, return_distances=False, return_indices=True))]
g = nd.gaussian_filter(g, DTM_SIGMA)
dtm = np.pad(nd.zoom(g, (ny / hb, nx / wb), order=1)[:ny, :nx], ((0, max(0, ny - hb * B)), (0, max(0, nx - wb * B))), mode='edge')[:ny, :nx]
# surface: empty cells from their neighbors, then the ground; drop lone spikes (birds, wires)
t = np.where(np.isfinite(top), top, np.nan)
for _ in range(3):
    h = np.isnan(t); nb = nd.grey_dilation(np.nan_to_num(t, nan=-1e9), size=3); t[h & (nb > -1e8)] = nb[h & (nb > -1e8)]
t = np.where(np.isnan(t), dtm, t)
ring = np.ones((3, 3), bool); ring[1, 1] = False
for _ in range(2):
    nbm = nd.grey_dilation(t, footprint=ring); sp = (t - nbm) > 8; t[sp] = nbm[sp]
t = np.maximum(t, dtm); t[(t - dtm) > 200] = dtm[(t - dtm) > 200]
# the lidar Arch (thin legs) comes out; the printed one plugs in
ax_, ay_ = merc(-90.1848, 38.6247)
ac = np.array([(ax_ - x0) * k / CELL, (y1 - ay_) * k / CELL])
yy, xx = np.mgrid[0:ny, 0:nx]; near = np.hypot(xx - ac[0], yy - ac[1]) * CELL < 130
t[near & ((t - dtm) > 25)] = dtm[near & ((t - dtm) > 25)]
# poles and light towers thinner than the nozzle: open them away (3 cells = 1.5 print pixels)
a = nd.grey_opening(t - dtm, size=(3, 3))
# street clutter (cars, curbs, shrubs) is under a layer or two tall and prints as squiggles: flatten it
a[a < GROUND_M] = 0
# rooftop clutter: bumps and pits narrower than CLUTTER cells and less than BUMP_M tall/deep get leveled to
# the roof around them. Opening/closing keep square corners, and tall narrow towers and deep alleys stay.
CW = (CLUTTER, CLUTTER)
op = nd.grey_opening(a, size=CW); a = np.where(a - op < BUMP_M, op, a)
cl_ = nd.grey_closing(a, size=CW); a = np.where(cl_ - a < BUMP_M, cl_, a)
a[a < GROUND_M] = 0
t = dtm + a
hc = BASE + ((dtm - ZMIN).clip(0) * EXAG + (t - dtm) * BEXAG) / M   # per lidar cell
hm = hc
hm = hm[:ny // 2 * 2, :nx // 2 * 2].reshape(ny // 2, 2, nx // 2, 2).mean(axis=(1, 3))   # print pixels
np.save(f'{out}/height.npy', hm.astype(np.float32))
print('print pixels', hm.shape, 'height', hm.min().round(2), '..', hm.max().round(2), 'mm')

# mesh: one outline per print layer, staircases straightened (terrace.py)
from terrace import terrace_solid
# terraces from the raw cells (each is roof or street, nothing in between, so a wall keeps one outline
# all the way up)
hc = hc[:ny // 2 * 2 + 1, :nx // 2 * 2 + 1]
model = terrace_solid(hc.astype(np.float64), PX / 2)
# Arch sockets: legs along the Arch's axis (fitted to its lidar legs; unit vector east, north)
axis = np.array([-0.3067697757045191, -0.9517837489231463])
_, _, ue, w0 = archflat.band(M, BEXAG); ue = abs(ue)
Hp = (hm.shape[0] - 1) * PX   # y of row 0
acm = np.array([ac[0] / 2 * PX, Hp - ac[1] / 2 * PX])
ang = float(np.degrees(np.arctan2(axis[1], axis[0])))
GAP = 0.2
for s in (-1, 1):
    lc = acm + s * ue * axis
    r, c = int(round((Hp - lc[1]) / PX)), int(round(lc[0] / PX))
    g0 = float(np.median(hm[r - 8:r + 9, c - 8:c + 9]))
    def blk(wx, wy, hz, zc): return Manifold.cube([wx, wy, hz], True).rotate([0, 0, ang]).translate([lc[0], lc[1], zc])
    model = model - blk(w0 + 2.4, archflat.T + 2.4, 20, g0 + 10) + blk(w0 + 2.4, archflat.T + 2.4, g0, g0 / 2) \
            - blk(w0 + 2 * GAP, archflat.T + 2 * GAP, 20, g0 - archflat.PEG + 10)
    print('socket at', lc.round(2), 'ground', round(g0, 2))
def save(man, path):
    # round to the STL's float32 first, so pieces that would touch after saving are seen now; keep the
    # main body (drops zero-volume slivers) and check it's a clean closed solid
    m_ = man.to_mesh(); v = (np.asarray(m_.vert_properties)[:, :3] + [1, 1, 0]).astype(np.float32).astype(np.float64)
    t_ = trimesh.Trimesh(v, np.asarray(m_.tri_verts))
    t_ = max(t_.split(only_watertight=False), key=lambda c: len(c.faces))
    t_.export(path)
    t2 = trimesh.load(path); print(path.split('/')[-1], 'watertight', t2.is_watertight, 'consistent', t2.is_winding_consistent)
    return t_
if os.environ.get('ZOOM'):   # also save a small piece for close-up renders: ZOOM=x0,y0,x1,y1 in mm
    z0, z1, z2, z3 = map(float, os.environ['ZOOM'].split(','))
    save(model ^ Manifold.cube([z2 - z0, z3 - z1, 100]).translate([z0, z1, -1]), f'{out}/zoom.stl')
tm = save(model, f'{out}/tile.stl')
print('tile', len(tm.faces), 'tris; arch', archflat.write_stl(f'{out}/arch.stl', M, BEXAG).round(2), 'mm')
