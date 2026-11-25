# Shared pieces: lidar -> per-cell heights (mm), the Arch sockets, and saving a clean STL.
# A grid is cells of half a print pixel, row 0 north. In print coordinates (mm) cell (r, c) sits at
# x = c * PXC, y = (ny - 1 - r) * PXC, which is how terrace.py lays out its mesh.
import numpy as np, os, math
from scipy import ndimage as nd
from concurrent.futures import ThreadPoolExecutor
from manifold3d import Manifold
import trimesh
from ept import EPT, merc
import archflat

PX = float(os.environ.get('PX', 0.15))
PXC = PX / 2                                   # mm per cell
BASE, ZMIN = 1.04, 115.83                      # floor thickness at the river, and the river's level (m)
EXAG = float(os.environ.get('EXAG', 1.0))      # ground relief: 1 = true scale
BEXAG = float(os.environ.get('BEXAG', 1.0))    # buildings, trees and the Arch: 1 = true height
GROUND_M = float(os.environ.get('GROUND_M', 2.5))  # anything lower than this above the ground is street
CLUTTER = int(os.environ.get('CLUTTER', 7))       # rooftop bumps/pits narrower than this many cells...
BUMP_M = float(os.environ.get('BUMP_M', 4.0))     # ...and shorter/shallower than this (m) are leveled
DTM_SIGMA = float(os.environ.get('DTM_SIGMA', 1.0))  # ground model smoothing, in 5-cell blocks
ARCH = (-90.1848, 38.6247)
ARCH_AXIS = np.array([-0.3067697757045191, -0.9517837489231463])   # leg to leg, (east, north); fitted to its lidar legs


def heights(lon, lat, M, nx, ny):
    """Heights in mm for an nx x ny grid of cells centered on (lon, lat) at M meters per mm.
    Returns (h, arch) where arch is the Arch's center in (col, row) cell coordinates."""
    k = math.cos(math.radians(lat)); cx, cy = merc(lon, lat)
    CELL = PXC * M                                 # true meters per cell
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
    print(f'cell {CELL:.2f} m, {np.isfinite(top).mean():.1%} of cells have a return', flush=True)
    # ground: 5-cell block minimum, holes from the nearest ground, lightly smoothed
    B = 5; hb, wb = ny // B, nx // B
    g = np.where(np.isfinite(gnd), gnd, np.nan)[:hb * B, :wb * B].reshape(hb, B, wb, B)
    del gnd
    with np.errstate(all='ignore'): g = np.nanmin(g, axis=(1, 3))
    bad = np.isnan(g); g = g[tuple(nd.distance_transform_edt(bad, return_distances=False, return_indices=True))]
    g = nd.gaussian_filter(g, DTM_SIGMA)
    dtm = np.pad(nd.zoom(g, (ny / hb, nx / wb), order=1)[:ny, :nx], ((0, max(0, ny - hb * B)), (0, max(0, nx - wb * B))), mode='edge')[:ny, :nx]
    # surface: empty cells from their neighbors, then the ground; drop lone spikes (birds, wires)
    t = np.where(np.isfinite(top), top, np.nan); del top
    for _ in range(3):
        hole = np.isnan(t); nb = nd.grey_dilation(np.nan_to_num(t, nan=-1e9), size=3); t[hole & (nb > -1e8)] = nb[hole & (nb > -1e8)]
    t = np.where(np.isnan(t), dtm, t)
    ring = np.ones((3, 3), bool); ring[1, 1] = False
    for _ in range(2):
        nbm = nd.grey_dilation(t, footprint=ring); sp = (t - nbm) > 8; t[sp] = nbm[sp]
    del nbm, sp
    t = np.maximum(t, dtm); t[(t - dtm) > 200] = dtm[(t - dtm) > 200]
    # the lidar Arch (thin legs) comes out; the printed one plugs in
    ax_, ay_ = merc(*ARCH)
    ac = np.array([(ax_ - x0) * k / CELL, (y1 - ay_) * k / CELL])
    r0, r1 = max(0, int(ac[1] - 130 / CELL) - 1), min(ny, int(ac[1] + 130 / CELL) + 2)
    c0, c1 = max(0, int(ac[0] - 130 / CELL) - 1), min(nx, int(ac[0] + 130 / CELL) + 2)
    if r0 < r1 and c0 < c1:
        yy, xx = np.mgrid[r0:r1, c0:c1]; tw, dw = t[r0:r1, c0:c1], dtm[r0:r1, c0:c1]
        near = (np.hypot(xx - ac[0], yy - ac[1]) * CELL < 130) & ((tw - dw) > 25); tw[near] = dw[near]
    # poles and light towers thinner than the nozzle: open them away (3 cells = 1.5 print pixels)
    a = nd.grey_opening(t - dtm, size=(3, 3)); del t
    # street clutter (cars, curbs, shrubs) is under a layer or two tall and prints as squiggles: flatten it
    a[a < GROUND_M] = 0
    # rooftop clutter: bumps and pits narrower than CLUTTER cells and less than BUMP_M tall/deep get leveled to
    # the roof around them. Opening/closing keep square corners, and tall narrow towers and deep alleys stay.
    CW = (CLUTTER, CLUTTER)
    op = nd.grey_opening(a, size=CW); a = np.where(a - op < BUMP_M, op, a); del op
    cl_ = nd.grey_closing(a, size=CW); a = np.where(cl_ - a < BUMP_M, cl_, a); del cl_
    a[a < GROUND_M] = 0
    h = (BASE + ((dtm - ZMIN).clip(0) * EXAG + a * BEXAG) / M).astype(np.float32)
    return h, ac


def add_sockets(model, h, arch, M, origin=(0.0, 0.0)):
    """Cut the two leg sockets into model (in print mm). h is the cell grid model was built from, arch the
    Arch's center in its cell coordinates; origin is where that grid's cell (row ny-1, col 0) sits."""
    ny = h.shape[0]
    acm = np.array([origin[0] + arch[0] * PXC, origin[1] + (ny - 1 - arch[1]) * PXC])
    _, _, ue, w0 = archflat.band(M, BEXAG); ue = abs(ue)
    ang = float(np.degrees(np.arctan2(ARCH_AXIS[1], ARCH_AXIS[0])))
    GAP = 0.2
    for s in (-1, 1):
        lc = acm + s * ue * ARCH_AXIS
        r, c = int(round(ny - 1 - (lc[1] - origin[1]) / PXC)), int(round((lc[0] - origin[0]) / PXC))
        g0 = float(np.median(h[r - 16:r + 17, c - 16:c + 17]))
        def blk(wx, wy, hz, zc): return Manifold.cube([wx, wy, hz], True).rotate([0, 0, ang]).translate([lc[0], lc[1], zc])
        model = model - blk(w0 + 2.4, archflat.T + 2.4, 20, g0 + 10) + blk(w0 + 2.4, archflat.T + 2.4, g0, g0 / 2) \
                - blk(w0 + 2 * GAP, archflat.T + 2 * GAP, 20, g0 - archflat.PEG + 10)
        print('socket at', lc.round(2), 'ground', round(g0, 2))
    return model


def save(man, path):
    """Write the solid 1 mm in from the bed corner. Rounds to the STL's float32 first, so pieces that would
    touch after saving are seen now; keeps the main body (drops zero-volume slivers) and checks it's clean."""
    m_ = man.to_mesh(); v = np.asarray(m_.vert_properties)[:, :3]
    v = (v - [v[:, 0].min() - 1, v[:, 1].min() - 1, 0]).astype(np.float32).astype(np.float64)
    t_ = trimesh.Trimesh(v, np.asarray(m_.tri_verts))
    t_ = max(t_.split(only_watertight=False), key=lambda c: len(c.faces))
    t_.export(path)
    t2 = trimesh.load(path)
    print(os.path.basename(path), len(t2.faces), 'tris, watertight', t2.is_watertight, 'consistent', t2.is_winding_consistent, flush=True)
    return t_
