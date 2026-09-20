#!/usr/bin/env python3
"""
Head CT DICOM -> two printable STLs, the skull halved down the midsagittal
plane, sinuses left open at the cut.

WHAT IS IN THIS PARTICULAR SCAN. It is a TMJ (jaw joint) study, not the whole
head: 166 mm running from mid-neck up to about the orbital roof, on a 203 mm
field of view. Two consequences, both unavoidable and both fine to print:

  - There is no skull vault. The model stops above the orbits, so this is a
    face, jaw, skull base and the top of the cervical spine, not a cranium.
  - The back of the head runs off the field of view. Real occipital bone
    reaches the edge of the image, so the model is flat-walled at the back.
    pad() turns that clipping into a clean flat face rather than a ragged one.

The mandible survives as one piece with the rest only because the mouth is
closed and the teeth occlude -- that contact is the single bridge holding it on.
On raw HU, raising BONE_HU to 300 breaks it and remove_floating then throws the
entire 40 cm^3 jaw away as debris. Labelling a smoothed copy (see
remove_floating) holds the bridge together well past that, but this is the
failure to check for first if a whole jaw ever goes missing.

There is also a 79 mm titanium fixation plate screwed to the right mandible,
3.3 cm^3 of it, pinned at the scanner's 3071 HU ceiling. It is real hardware and
it prints as part of the model. It is also the source of most of the streaking
in this study, and of the fact that the right half and the left differ by 14% in
volume -- the plate and its artifact are all on one side.

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

3. The volume is resampled to cubic voxels, because the scan is 0.396 mm
   in-plane but 0.625 mm between slices. The interpolation has to be CUBIC:
   marching cubes is itself linear, so linear upsampling reproduces the very
   same isosurface and buys nothing but triangles. On this scan that resample
   also carries a rotation -- see straighten().

4. Denoising is a sub-millimetre Gaussian on HU values, not a mesh filter, and
   it is the setting that decides how much detail survives -- see PRESMOOTH_MM.
   Taubin afterwards is close to free: on this scan 20 iterations move the
   surface 0.015 mm on average, 0.079 mm at the very most, and leave the volume
   unchanged at 165.0 cm^3. It has converged by then and is removing nothing,
   so it is only there to take the last of the tessellation hash off. When the
   model looks over-smoothed, Taubin is not the culprit; the Gaussian is.

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
DICOM_DIR = "/Users/andrew/Downloads/DICOM"
SERIES = "TMJ CLOSED STND"  # 266 slices @ 0.625 mm, STANDARD kernel.
                            #
                            # This study has three series thin enough to print,
                            # all covering the same 166 mm and all 0.396 mm
                            # in-plane, so the choice is entirely about kernel:
                            #
                            #   TMJ CLOSED STND  266 @ 0.625  STANDARD
                            #   TMJ CLOSED BONE  531 @ 0.3125 BONE
                            #   BONE MAR         255 @ 0.65   BONE + metal
                            #                                 artifact reduction
                            #
                            # The BONE kernel is a sharpening filter. It is the
                            # right thing to LOOK at and the wrong thing to
                            # threshold: at 140 HU it breaks the volume into
                            # 3107 disconnected pieces against STND's 204 (MAR,
                            # also BONE-kernel, is worst at 7144). That noise
                            # becomes surface, and remove_floating below only
                            # deletes the specks that are fully detached -- the
                            # ones touching real bone stay as warts.
                            #
                            # Losing MAR costs something real: there is a full
                            # arch of dental restorations in here (59k voxels
                            # pinned at the 3071 HU ceiling) throwing visible
                            # streaks. But the streaks are mostly DARK, so they
                            # sit below the threshold and are largely invisible
                            # to marching cubes -- the metal slice is only 8%
                            # more above-threshold area in STND than in MAR.
                            # Trading a 35x noise increase for that is a bad
                            # deal. The BONE series' finer 0.3125 mm slice
                            # spacing is likewise not worth it: it is an
                            # overlapping reconstruction of the same 0.625 mm
                            # thick slices, so it carries no extra information.
OUTPUT = "/Users/andrew/junk/skull/aug2025/skull_{side}.stl"   # absolute, so the files land in
                                                 # the same place whatever
                                                 # directory you run from

# Bone threshold.
#
# The genus sweep that picked 140 for the previous scan is nearly FLAT here --
# 463 at 140, 474 at 200, 495 at 260 -- so it cannot choose between them, and
# 140 is the wrong end of that flat basin. Raw HU values step from soft tissue
# to cortical bone over two or three voxels, and a threshold down at 140 sits in
# that ramp rather than on the bone: it picks up the partial-volume halo, which
# pads every surface outward and welds anything within a voxel of anything else.
# On this scan that is what fused the tooth crowns into one continuous ridge and
# rounded the fixation plate's screws into anonymous bumps.
#
# 200 sits above the ramp. Teeth separate into crowns, the screws read as
# screws, and the outer cortical surface lands where the bone actually is --
# the kept volume drops 325 -> 294 cm^3, and most of that 10% is halo rather
# than bone. The cost is real though: the thinnest structures, orbital and
# sinus walls, start to perforate, and those are the fragile parts of a print.
# 140 is the safer value if a wall blows out somewhere that matters.
#
# What makes 200 safe at all is the smoothed labelling in remove_floating: on
# raw HU the mandible hangs on by one tooth-contact bridge that breaks in this
# range, and the whole 40 cm^3 jaw gets deleted as debris. Read that comment
# before raising this further.
BONE_HU = 200

PRESMOOTH_MM = 0.3          # Gaussian sigma on HU. Past ~0.6 mm, thin bone
                            # (orbital walls, nasal conchae) blurs below the
                            # threshold and disappears.
                            #
                            # 0.5 was too much for this scan and showed: tooth
                            # cusps fused into one mass, vertebrae came out as
                            # featureless blobs, no trabecular or sutural
                            # texture anywhere. A 203 mm field of view over a
                            # 512 matrix with a STANDARD kernel is already
                            # band-limited around 0.6-0.7 mm FWHM, and a 0.5 mm
                            # sigma (1.18 mm FWHM) on top of that roughly
                            # doubles the blur -- it was throwing away most of
                            # what the scanner resolved. 0.3 keeps the detail
                            # and still suppresses the noise that matters.
                            #
                            # It cannot go to 0: the dental metal throws a
                            # streak dense enough to cross 140 HU, and unsmoothed
                            # it becomes a slab of false bone bridging the upper
                            # arch. 0.25 already removes it, so 0.3 has margin.
TAUBIN_ITERATIONS = 20      # returns flatten out around here

# How far the head is off square in the scanner, in degrees. Unlike the previous
# scan this one is NOT straight, so the volume is rotated before it is cut --
# see straighten() for why this cannot be left to the plane search.
#
# Both angles were found by maximising the same mirror-overlap score that
# midsagittal() uses, over a grid of whole-volume rotations. The maximum is
# smooth and interior, not an artefact of the search bounds:
#
#     roll    -3.00  -2.75  -2.50  -2.25      yaw    +1.00  +1.50  +2.00
#     score   0.5459 0.5497 0.5468 0.5450     score  0.5430 0.5497 0.5465
#
# Leaving both at 0 scores 0.4769. PITCH is deliberately absent: it is rotation
# about the left-right axis, which slides the midsagittal plane along itself and
# so cannot affect the cut.
ROLL_DEG = -2.75            # about the front-back axis (tilts head toward a
                            # shoulder); costs ~4 mm across the 166 mm of height
YAW_DEG = 1.50              # about the vertical axis (turns head to a side);
                            # costs ~2 mm across the 156 mm of depth

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

    # Label a SMOOTHED copy, but blank the debris in the real volume. Deciding
    # what is connected to what is a question about shape, and asking it of raw
    # HU means asking it of the noise too: a single voxel flickering over 140 HU
    # either welds a speck onto the skull or splits a real structure off it.
    # Smoothing first cut the region count on this scan from 204 to 118, and it
    # is what makes the isolevel safe to raise -- labelling raw, BONE_HU=300
    # broke the one tooth-contact bridge holding the mandible on and
    # remove_floating deleted the entire 40 cm^3 jaw as debris. Smoothed, the
    # largest thing dropped stays around 3 cm^3 all the way up to 260 HU.
    #
    # The surface itself is NOT taken from this copy. It comes from the real
    # volume, smoothed exactly once, after the resample -- so this robustness
    # costs no sharpness. (It is also why presmooth() still exists separately.)
    smooth = ndimage.gaussian_filter(vol, [PRESMOOTH_MM / s for s in spacing],
                                     mode="nearest")
    labels, n = ndimage.label(smooth >= BONE_HU, structure=np.ones((3, 3, 3), np.uint8))
    del smooth

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
    over the isolevel. 10 voxels (4.0 mm here) is well past anything a 0.5 mm
    sigma reaches. 4 voxels was very nearly enough too -- widening it changed the mesh
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

    Only the plane's POSITION is searched, not its tilt -- straighten() has
    already turned the head square by the time this runs, so all that is left to
    find is where along X the plane sits. Expect an overlap around 0.55 here; it
    was 0.477 before the rotation, and a number back down at that level means
    ROLL_DEG/YAW_DEG no longer match the data.

    The score is lower than the previous scan's 0.825 for a reason that is not a
    problem: this volume includes the cervical spine and a mandible full of
    dental work, neither of which is as bilaterally symmetric as a cranium.
    Only the peak location matters, not its height.
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
def straighten(vol, spacing):
    """Rotate the head square and resample to cubic voxels, in ONE pass.

    The plane search in midsagittal() only slides the plane sideways, it cannot
    tilt it. That was fine for the previous scan, which was already square, but
    this head is rolled 2.75 degrees, and a plane parallel to the voxel grid
    when the skull is not simply cannot be the midsagittal plane: over 166 mm of
    height it enters about 4 mm to one side of the midline and leaves 4 mm to
    the other. The halves would be visibly unequal and the cut would miss the
    nasal septum and the sella. So the VOLUME is turned instead, and the
    grid-aligned cut then is the right one.

    Rotating and resampling are folded into a single affine_transform rather
    than done as three consecutive ndimage calls, because each cubic pass blurs.
    Scored against the very rotation this was fitted to, the three-pass version
    reaches 0.5497 mirror overlap and this one 0.5488 -- the difference is that
    the three-pass mask has been smeared enough to overlap itself slightly
    better, which is exactly the blur being avoided.

    The output grid is sized from the rotated corners of the input, so nothing
    is turned out of the array, and the two grids share a centre.
    """
    from scipy import ndimage

    iso = min(spacing)

    def rot(a, b, deg):
        t = np.deg2rad(deg)
        r = np.eye(3)
        r[a, a] = r[b, b] = np.cos(t)
        r[a, b], r[b, a] = -np.sin(t), np.sin(t)
        return r

    # Array axes are (z, y, x): roll turns in the z-x plane, yaw in the y-x one.
    R = rot(1, 2, YAW_DEG) @ rot(0, 2, ROLL_DEG)

    extent = np.array(vol.shape) * np.array(spacing)      # mm
    corners = np.array([[sz * ((i >> k) & 1) for k, sz in enumerate(extent)]
                        for i in range(8)]) @ R.T
    out_shape = tuple(int(np.ceil(s / iso)) + 1
                      for s in corners.max(0) - corners.min(0))

    # affine_transform maps OUTPUT indices back to INPUT indices, so the matrix
    # is the inverse of the transform being applied: out index -> mm -> rotate
    # back -> in index.
    M = (iso * np.diag(1.0 / np.array(spacing))) @ R.T
    offset = ((np.array(vol.shape) - 1) / 2.0
              - M @ ((np.array(out_shape) - 1) / 2.0))

    print(f"\nStraightening (roll {ROLL_DEG:+.2f}, yaw {YAW_DEG:+.2f} deg) and "
          f"resampling to isotropic {iso:.3f} mm (cubic) ...")
    vol = ndimage.affine_transform(vol, M, offset=offset, output_shape=out_shape,
                                   order=3, cval=AIR_HU)
    print(f"  {vol.shape}")
    return vol, (iso, iso, iso)


def presmooth(vol, spacing):
    """Gaussian on HU values -- see point 4 in the module docstring.

    Run on the whole volume before it is halved, not on each half. Smoothing a
    half would run the filter's edge handling along the cut plane and soften the
    very face that pad() exists to keep flat.
    """
    from scipy import ndimage

    sigma = PRESMOOTH_MM / spacing[0]
    print(f"Pre-smoothing HU, sigma {PRESMOOTH_MM} mm ({sigma:.2f} voxels) ...")
    return ndimage.gaussian_filter(vol, sigma, mode="nearest")


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

    # Debris is labelled on the ORIGINAL grid, before straighten() inflates the
    # volume ~1.6x. Labelling is the memory high-water mark of the whole script
    # (an int32 label array the size of the volume), and doing it here rather
    # than after the resample keeps that off the big array for free.
    vol, keep_mask = remove_floating(vol, spacing)
    del keep_mask

    vol, spacing = straighten(vol, spacing)

    # The debris is already AIR_HU, so a plain threshold now recovers what
    # labelling would: everything left above 140 HU is the one kept solid, give
    # or take a skin of voxels the cubic interpolation lifted over the line
    # alongside real bone. trim() only wants bounds and midsagittal() only wants
    # a mirror score, and neither can tell the difference.
    keep_mask = vol >= BONE_HU
    vol, keep_mask = trim(vol, keep_mask)
    vol = presmooth(vol, spacing)
    x0 = midsagittal(keep_mask)
    del keep_mask

    for side, half, start in halves(vol, x0):
        print(f"\n{'-' * 20} {side} half {'-' * 20}")
        sub = pad(half)
        # pad() put 2 voxels in front of the data, and this half started at
        # `start` in the trimmed volume, so shift by the difference to land
        # back in the trimmed volume's own coordinates.
        mesh = build_mesh(sub, spacing, (start - 2) * spacing[2])
        del sub
        report(side, mesh)

        path = OUTPUT.format(side=side)
        mesh.export(path)
        print(f"Wrote {path}  ({Path(path).stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
