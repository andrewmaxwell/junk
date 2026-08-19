#!/usr/bin/env python3
"""
Head CT DICOM -> two printable STLs, the skull halved down the midsagittal
plane, sinuses left open at the cut.

    pip3 install pydicom numpy scipy scikit-image trimesh pylibjpeg pylibjpeg-libjpeg
    python3 skull_stl.py

Everything that decides surface quality happens in the VOXEL VOLUME, before a
single triangle exists. Marching cubes places each vertex by interpolating
between an inside voxel and its outside neighbour, so the volume has to carry
real Hounsfield values everywhere -- including the soft tissue sitting just
outside the bone. Smoothing a finished mesh can only average vertices that were
already put in the wrong place.

Five things that matter, each of which was measured rather than guessed:

1. The cut happens in the VOLUME, not on the finished mesh. Each half is sliced
   out of the voxel grid and padded, and marching cubes generates the flat cut
   face itself. Sinuses are already air in the CT, so no surface is generated
   across them and they come out as open holes automatically. Capping a mesh
   after the fact (Slicer's scissors, trimesh's slice_plane) triangulates the
   whole cross-section outline and seals the sinuses shut -- which on a
   midsagittal section would fill in the frontal and sphenoid sinuses, the
   nasal cavity and the sella, i.e. most of what makes the section worth
   looking at.

2. Only DISCARDED solids are overwritten with air. Blanking every sub-threshold
   voxel instead -- which is the obvious way to write remove_floating, and is
   what this script used to do -- throws away one of the two numbers marching
   cubes interpolates between. The surface then snaps toward voxel corners
   (a hard staircase, 26% of edges over 30 degrees) and is dragged inward
   enough to erode 36 cm^3 of bone.

3. The volume is resampled to cubic voxels, because the scan is 0.44 mm
   in-plane but 0.625 mm between slices. The interpolation has to be CUBIC:
   marching cubes is itself linear, so linear upsampling reproduces the very
   same isosurface and buys nothing but triangles.

4. Denoising is a sub-millimetre Gaussian on HU values, not a mesh filter.
   Taubin afterwards is close to free -- 20 iterations move the surface 0.008 mm
   on average and change the volume by 0.4 cm^3 out of 333 (measured on the
   uncut skull) -- so it is only there to take the last of the tessellation
   hash off.

5. The isolevel is offset half a unit below the integer threshold. Raw HU values
   are integers, so asking for exactly 140.0 puts voxels precisely ON the
   surface and marching cubes produces cracks and non-manifold junctions there.

Not done on purpose: decimation. It costs almost no accuracy (0.004 mm mean
deviation at 900k faces) but every budget under ~1.1M triangles reliably left
one non-manifold edge behind, and the full-resolution mesh is perfectly clean.
The STLs are ~80 MB each and Bambu Studio warns about the triangle count.
Ignore it.

The two halves are written in a shared coordinate frame and their cut faces are
measured to land on the same plane to four decimals, so loading both at once
reassembles the skull exactly. To print, stand each one on its cut face.
"""

import sys
from pathlib import Path

import numpy as np

# ----------------------------------------------------------------- settings
DICOM_DIR = "/Users/andrew/Downloads/DICOM 2"
SERIES = "0.6 Ax Head"      # 280 slices @ 0.625 mm; the other series in this
                            # study are 2.5-5 mm, far too coarse to print
OUTPUT = "/Users/andrew/junk/skull_{side}.stl"   # absolute, so the files land in
                                                 # the same place whatever
                                                 # directory you run from

# Bone threshold. Chosen by sweeping 75..300 HU and taking the minimum of the
# mesh genus (its number of holes and tunnels), which is a decent proxy for
# "amount of stuff that is not really there": below ~100 HU, dense soft tissue
# and CT noise add spurious flakes and bridges (genus 229 at 75 HU, and 3197
# disconnected specks instead of ~120); above ~150 HU, real thin bone starts
# perforating (genus 177 at 150, 196 at 300). The basin bottoms out at 140.
BONE_HU = 140

PRESMOOTH_MM = 0.5          # Gaussian sigma on HU. Past ~0.6 mm, thin bone
                            # (orbital walls, nasal conchae) blurs below the
                            # threshold and disappears.
TAUBIN_ITERATIONS = 20      # returns flatten out around here

AIR_HU = -1024.0
ISOLEVEL = BONE_HU - 0.5


# --------------------------------------------------------------------- load
def load_series():
    import pydicom

    files = [p for p in Path(DICOM_DIR).rglob("*") if p.is_file()]
    if not files:
        sys.exit(f"No files found under {DICOM_DIR}")
    print(f"Scanning {len(files)} files ...")

    series = {}
    for f in files:
        try:
            d = pydicom.dcmread(str(f), stop_before_pixels=True, force=True)
        except Exception:
            continue
        if not hasattr(d, "SeriesInstanceUID") or not hasattr(d, "ImagePositionPatient"):
            continue
        uid = d.SeriesInstanceUID
        series.setdefault(uid, {"desc": str(d.get("SeriesDescription", "?")), "files": []})
        series[uid]["files"].append(str(f))

    match = [u for u, i in series.items() if SERIES.lower() in i["desc"].lower()]
    if not match:
        sys.exit(f"No series matching '{SERIES}'. Found: "
                 + ", ".join(f"{i['desc']} ({len(i['files'])})" for i in series.values()))
    info = series[match[0]]
    print(f"Using '{info['desc']}' ({len(info['files'])} slices)")

    ds = [pydicom.dcmread(f) for f in info["files"]]
    ds.sort(key=lambda d: float(d.ImagePositionPatient[2]))  # inferior -> superior

    # Axial, HFS, identity direction cosines: column index runs to the patient's
    # left, row index posterior, slice index superior. That is DICOM's LPS frame,
    # which is right-handed, so the (z,y,x) -> (x,y,z) shuffle in build_mesh
    # relabels the axes without mirroring the anatomy. Assert it rather than
    # trust it -- a mirrored skull would look completely plausible.
    iop = np.array([float(v) for v in ds[0].ImageOrientationPatient])
    if not np.allclose(iop, [1, 0, 0, 0, 1, 0], atol=1e-3):
        sys.exit(f"Unexpected ImageOrientationPatient {iop}; the model would be "
                 f"rotated or mirrored. Handle this orientation explicitly.")

    zs = np.array([float(d.ImagePositionPatient[2]) for d in ds])
    dz = np.diff(zs)
    if dz.std() > 1e-3:
        print(f"! Slice spacing is uneven (std {dz.std():.4f} mm) -- gantry tilt or "
              f"a mixed series will distort the model.")
    spacing = (float(dz.mean()), *(float(v) for v in ds[0].PixelSpacing))

    n, rows, cols = len(ds), int(ds[0].Rows), int(ds[0].Columns)
    print(f"Reading {n} x {rows} x {cols} volume ...")
    vol = np.empty((n, rows, cols), dtype=np.float32)
    for i, d in enumerate(ds):
        vol[i] = (d.pixel_array.astype(np.float32) * float(d.get("RescaleSlope", 1))
                  + float(d.get("RescaleIntercept", 0)))

    print(f"Voxel {spacing[0]:.3f} x {spacing[1]:.3f} x {spacing[2]:.3f} mm   "
          f"HU {vol.min():.0f} .. {vol.max():.0f}")
    return vol, spacing


# ----------------------------------------------------- drop floating solids
def remove_floating(vol, spacing):
    from scipy import ndimage

    voxel_mm3 = float(np.prod(spacing))
    print(f"\nFinding solid regions >= {BONE_HU} HU ...")
    labels, n = ndimage.label(vol >= BONE_HU, structure=np.ones((3, 3, 3), np.uint8))

    counts = np.bincount(labels.ravel())
    counts[0] = 0
    biggest = int(np.argmax(counts))
    keep_mask = labels == biggest
    dropped = (counts.sum() - counts[biggest]) * voxel_mm3
    print(f"  {n} regions; keeping the largest ({counts[biggest] * voxel_mm3:,.0f} mm^3), "
          f"dropping {n - 1} ({dropped:,.0f} mm^3 of debris)")

    # Only the debris becomes air. Everything else keeps its real HU -- see
    # point 2 in the module docstring, this is the single most important line
    # in the script.
    vol[(labels > 0) & ~keep_mask] = AIR_HU
    return vol, keep_mask


# --------------------------------------------------------------------- trim
def trim(vol, keep_mask):
    """Cut away the air around the head. Mostly memory and speed.

    The margin is measured from the >=140 HU mask, but the surface can sit a
    little outside that mask: what borders the bone is soft tissue at 50-100 HU,
    not air, so blurring a 1000+ HU cortical plate into it lifts nearby voxels
    over the isolevel. 10 voxels (4.4 mm) is well past anything a 0.5 mm sigma
    reaches. 4 voxels was very nearly enough too -- widening it changed the mesh
    by 0.4 cm^3 out of 305 and moved no bound -- but the headroom is free.
    """
    box = []
    for axis in range(3):
        hit = np.nonzero(keep_mask.any(axis=tuple(a for a in range(3) if a != axis)))[0]
        box.append(slice(max(0, hit[0] - 10), hit[-1] + 11))
    vol, keep_mask = vol[tuple(box)], keep_mask[tuple(box)]
    print(f"Trimmed to {vol.shape}")
    return vol, keep_mask


# ------------------------------------------------------- midsagittal plane
def midsagittal(keep_mask):
    """X index of the plane that best mirrors the skull onto itself.

    The bounding-box centre is not good enough: it is set by whichever single
    voxel sticks out furthest on each side, so one bit of ear cartilage or a
    stray mastoid speck shifts it by millimetres. Scoring how well the skull
    maps onto its own mirror image uses every voxel instead.

    Only the plane's POSITION is searched, not its tilt. This scan was checked
    for that -- rotating the mask +-6 degrees in yaw or roll made the mirror
    overlap monotonically worse (0.825 unrotated, 0.767 at 2 degrees), so the
    head is already square in the scanner and a straight axial-grid cut is the
    right one. A tilted head would need the volume rotated first, and the
    printed message below is what would tell you.
    """
    xs = np.nonzero(keep_mask.any(axis=(0, 1)))[0]
    centre = int((xs[0] + xs[-1]) // 2)

    # Halve Z and Y for speed but keep X at full resolution -- X is the axis
    # being measured, and the whole point is sub-voxel-grade placement.
    sub = keep_mask[::2, ::2, :]
    total = sub.sum()
    best = (-1.0, centre)
    for x0 in range(centre - 15, centre + 16):
        lo, hi = max(0, 2 * x0 - (sub.shape[2] - 1)), min(sub.shape[2], 2 * x0 + 1)
        window = sub[:, :, lo:hi]
        overlap = np.logical_and(window, window[:, :, ::-1]).sum() / total
        if overlap > best[0]:
            best = (overlap, x0)
    print(f"\nMidsagittal plane at x={best[1]} (bounding-box centre was {centre}); "
          f"mirror overlap {best[0]:.3f}")
    if abs(best[1] - centre) == 15:
        print("  ! that is the edge of the search window, so the real best plane is "
              "probably further out. Widen the range.")
    return best[1]


def halves(vol, x0):
    """The two sides, and where each starts in the trimmed volume's X axis.

    Both halves stop one voxel short of each other rather than sharing the
    plane. The flat cap in pad() puts a cut face essentially AT the padding
    voxel, so if the right half kept 0..x0 and the left kept x0.., both faces
    would land on plane x0+1 and x0-1 respectively and the reassembled skull
    would be a voxel too wide. Dropping the single column at x0 -- 0.44 mm,
    consumed by the two saw kerfs, so to speak -- puts both faces exactly on
    plane x0 and the halves mate flush.

    Column index increases toward the patient's LEFT (DICOM LPS, asserted in
    load_series), so the low-X side is the patient's right.
    """
    yield "right", vol[:, :, :x0], 0
    yield "left", vol[:, :, x0 + 1:], x0 + 1


# ------------------------------------------------------- resample / denoise
def to_isotropic(vol, spacing):
    from scipy import ndimage

    iso = min(spacing)
    print(f"\nResampling to isotropic {iso:.3f} mm (cubic) ...")
    vol = ndimage.zoom(vol, [s / iso for s in spacing], order=3, mode="nearest")
    print(f"  {vol.shape}")

    sigma = PRESMOOTH_MM / iso
    print(f"Pre-smoothing HU, sigma {PRESMOOTH_MM} mm ({sigma:.2f} voxels) ...")
    return ndimage.gaussian_filter(vol, sigma, mode="nearest"), (iso, iso, iso)


# ---------------------------------------------------------------------- pad
def pad(vol):
    """Surround the volume so marching cubes closes the model itself.

    Every face is padded a hair BELOW the isolevel rather than with air. Where
    bone runs off the edge -- the sagittal cut, and the bottom of the scan
    through the neck -- padding with air would make the crossing point depend on
    how dense that last column of bone happens to be, so the face comes out
    subtly lumpy; a value just under the isolevel puts the crossing essentially
    on the plane whatever the density. Where the volume ends in air instead, the
    two choices are indistinguishable: both are below the isolevel, so neither
    generates a surface. One value, correct on all six faces.

    Being below the isolevel is also what keeps the sinuses open. They are
    already air in the CT, so no surface is generated across them and they come
    out as holes in the cut face.
    """
    vol = np.pad(vol, 2, mode="constant", constant_values=ISOLEVEL - 1e-3)
    print(f"Padded to {vol.shape}")
    return vol


# ------------------------------------------------------------------- meshing
def build_mesh(vol, spacing, x_offset_mm):
    import trimesh
    from skimage.measure import marching_cubes

    print(f"\nMarching cubes at {ISOLEVEL} (== voxels >= {BONE_HU} HU) ...")
    verts, faces, _, _ = marching_cubes(vol, level=ISOLEVEL, spacing=spacing)
    print(f"  {len(faces):,} triangles")

    # marching_cubes indexes (z, y, x); relabel so Z is up for the slicer.
    # See the orientation assertion in load_series -- this is not a mirror.
    verts = verts[:, [2, 1, 0]]

    # Put the half back where it came from, so the two STLs line up with each
    # other when both are dropped on the plate.
    verts[:, 0] += x_offset_mm

    # process=False keeps the exact marching-cubes topology. Letting trimesh
    # merge vertices here is what introduced non-manifold edges in testing.
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)

    # Everything past the outer shell is an enclosed air pocket: sinuses the cut
    # misses, plus a lot of tiny trabecular marrow voids. None are reachable
    # from outside, and they would only add print time. Label the face-adjacency
    # graph rather than split(), which builds a full submesh per component.
    #
    # Halving the skull can also strand real bone: anything that reached the
    # rest of the skeleton only by crossing the midline is now a separate piece.
    # Those would be unprintable floating debris, so they go too -- but loudly,
    # because a big one means real anatomy is being thrown away.
    labels = trimesh.graph.connected_component_labels(
        mesh.face_adjacency, node_count=len(mesh.faces))
    sizes = np.bincount(labels)
    if len(sizes) > 1:
        stranded = np.sort(sizes)[::-1][1:]
        print(f"  {len(sizes)} shells -> outer only (dropped {len(sizes) - 1}; "
              f"largest {stranded[0]:,} faces)")
        if stranded[0] > len(mesh.faces) * 0.01:
            print("  ! that is over 1% of the mesh -- check it is not a real bone "
                  "that only connected across the midline.")
        mesh.update_faces(labels == sizes.argmax())
        mesh.remove_unreferenced_vertices()

    mesh.fix_normals()
    print(f"  Taubin smoothing x{TAUBIN_ITERATIONS}")
    trimesh.smoothing.filter_taubin(mesh, iterations=TAUBIN_ITERATIONS)

    _, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
    if (counts == 1).any():
        print(f"  filling {int((counts == 1).sum())} open edges")
        mesh.fill_holes()
        mesh.fix_normals()
    return mesh


def report(side, mesh):
    # Count every edge not shared by exactly two faces. Checking only for edges
    # used once or three times silently misses the four-face edges that show up
    # after decimation or a bad isolevel.
    _, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
    n_open = int((counts == 1).sum())
    n_bad = int((counts > 2).sum())
    sx, sy, sz = mesh.bounds[1] - mesh.bounds[0]

    print("\n" + "=" * 56)
    print(f"  {side} half")
    print(f"  triangles           {len(mesh.faces):,}")
    print(f"  watertight          {mesh.is_watertight}")
    print(f"  open edges          {n_open}")
    print(f"  non-manifold edges  {n_bad}")
    print(f"  volume              {mesh.volume / 1000:.1f} cm^3")
    print(f"  size X/Y/Z mm       {sx:.1f} x {sy:.1f} x {sz:.1f}")
    print(f"  cut face at X       {mesh.bounds[0][0]:.3f} .. "
          f"{mesh.bounds[1][0]:.3f} mm")
    print("=" * 56)
    if n_open or n_bad:
        print("  ! Bambu Studio will offer to repair this -- tell Claude these numbers.")


def main():
    vol, spacing = load_series()
    vol, keep_mask = remove_floating(vol, spacing)
    vol, keep_mask = trim(vol, keep_mask)
    x0 = midsagittal(keep_mask)
    del keep_mask

    for side, half, start in halves(vol, x0):
        print(f"\n{'-' * 20} {side} half {'-' * 20}")
        sub, sub_spacing = to_isotropic(half, spacing)
        sub = pad(sub)
        # pad() put 2 voxels in front of the data, and this half started at
        # `start` in the trimmed volume, so shift by the difference to land
        # back in the trimmed volume's own coordinates.
        mesh = build_mesh(sub, sub_spacing, (start - 2) * spacing[2])
        del sub
        report(side, mesh)

        path = OUTPUT.format(side=side)
        mesh.export(path)
        print(f"Wrote {path}  ({Path(path).stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
