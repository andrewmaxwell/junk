# The Gateway Arch as a flat band to print on its side, plus where its legs land.
import numpy as np, trimesh
FT = 0.3048
T, W_MIN, PEG = 1.2, 1.0, 1.5    # thickness as printed, narrowest band width, how far legs go into the tile

def band(m_per_mm, zscale=1.0):
    xs = np.linspace(-299.2239, 299.2239, 200)
    zs = 693.8597 - 68.7672 * np.cosh(0.0100333 * xs)           # NPS centroid catenary, feet
    side = (54 - (54 - 17) * zs / zs.max()) * FT / m_per_mm
    u, z = xs * FT / m_per_mm, zs * FT / m_per_mm * zscale
    w = np.maximum(side * np.sqrt(3) / 2, W_MIN)
    u = np.r_[u[0], u, u[-1]]; z = np.r_[-PEG, z, -PEG]; w = np.r_[w[0], w, w[-1]]
    du, dz = np.gradient(u), np.gradient(z); L = np.hypot(du, dz); nu, nz = -dz / L, du / L
    nu[:2], nu[-2:] = np.sign(nu[2]), np.sign(nu[-3]); nz[:2] = nz[-2:] = 0   # straight pegs
    return np.c_[u - nu * w / 2, z - nz * w / 2], np.c_[u + nu * w / 2, z + nz * w / 2], u[0], w[0]

def write_stl(path, m_per_mm, zscale=1.0):
    O, I, _, _ = band(m_per_mm, zscale); n = len(O)
    V = np.r_[np.c_[O, np.zeros(n)], np.c_[I, np.zeros(n)], np.c_[O, np.full(n, T)], np.c_[I, np.full(n, T)]]
    o0, i0, o1, i1 = 0, n, 2 * n, 3 * n; F = []
    for k in range(n - 1):
        F += [[o0 + k, i0 + k, o0 + k + 1], [i0 + k, i0 + k + 1, o0 + k + 1], [o1 + k, o1 + k + 1, i1 + k], [i1 + k, o1 + k + 1, i1 + k + 1],
              [o0 + k, o0 + k + 1, o1 + k], [o1 + k, o0 + k + 1, o1 + k + 1], [i0 + k, i1 + k, i0 + k + 1], [i1 + k, i1 + k + 1, i0 + k + 1]]
    for k in (0, n - 1):
        F += [[o0 + k, o1 + k, i0 + k], [i0 + k, o1 + k, i1 + k]]
    M = trimesh.Trimesh(V, np.array(F)); M.fix_normals(); M.apply_translation(-M.bounds[0] + [1, 1, 0])
    M.export(path); return M.extents
