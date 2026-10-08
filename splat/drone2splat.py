#!/usr/bin/env python3
"""
drone2splat.py - drone video OR folder of photos -> COLMAP poses -> Gaussian splat (.ply)
                 -> compressed .sog + camera list for the web viewer in index.html
Built for Apple Silicon (M-series) Macs: no CUDA required.

Pipeline
  1. Image selection  : video  -> score every frame for sharpness (Laplacian variance) and
                                  keep the sharpest frame in each time window.
                        photos -> drop only shots that are clearly blurrier than their
                                  neighbours, thin evenly to the preset's cap.
  2. Camera poses     : COLMAP on CPU (sequential matching for video, exhaustive for photos),
                        then aligned to the photos' GPS so the scene is level, north is north
                        and units are meters (skipped when there's no GPS, e.g. most videos).
  3. Undistort        : convert to a PINHOLE dataset that any splat trainer accepts.
  4. Train splat      : Brush (default, Metal/WebGPU) or OpenSplat (Metal/MPS).
  5. Web export       : recenter, rotate to Y-up and compress to .sog with splat-transform,
                        plus a small <name>-preview.sog the viewer shows while the full one loads,
                        and a .json of the drone's viewpoints for the viewer to fly between.

Progress percentages are printed every few seconds; everything the tools print goes to
<project>/log.txt. The Mac is kept awake while it runs.

Each stage is skipped if its output already exists, so you can re-run after a failure
or re-train with different settings without redoing earlier work (use --force to redo).

Setup (one time)
  brew install colmap
  python3 -m venv .venv && .venv/bin/pip install opencv-python numpy   (then run with .venv/bin/python)
  Brush:     download the macOS release from https://github.com/ArthurBrussee/brush/releases
             and put brush_app on your PATH or in bin/ next to this script
             (or pass --trainer-bin /path/to/brush_app)
  OpenSplat: optional alternative, build with -DGPU_RUNTIME=MPS
  Node.js:   for the web export (runs @playcanvas/splat-transform via npx)

Usage
  python3 drone2splat.py house.mp4                     # standard quality
  python3 drone2splat.py "~/Pictures/House Photos" -q draft   # folder of interval photos
  python3 drone2splat.py house.mp4 -q max              # overnight, full 4K
  python3 drone2splat.py house.mp4 -q high --steps 40000   # preset + any override
  python3 drone2splat.py house.mp4 --trainer opensplat --trainer-bin ~/OpenSplat/build/opensplat
  python3 drone2splat.py "~/Pictures/House Photos" --web-out ~/junk/splat/house.sog
"""

import argparse
import json
import os
import pty
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError:
    sys.exit("Missing Python deps. Run:  pip3 install opencv-python numpy")


# ----------------------------------------------------------------------------- helpers

LOG_FILE = None  # <project>/log.txt once the project folder is known; gets the tools' full output


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    if LOG_FILE:
        LOG_FILE.write(line + "\n")
        LOG_FILE.flush()


def fmt_time(seconds: float) -> str:
    m = int(seconds) // 60
    return f"{m // 60}h{m % 60:02d}m" if m >= 60 else f"{m}m{int(seconds) % 60:02d}s"


ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")


def run(cmd: list[str], fatal: bool = True, progress=None) -> bool:
    """Run a command, sending its output to the log file rather than the terminal.

    `progress` maps an output line to (stage, done, total) or None. Every few seconds the
    latest one is printed as a percentage. The command runs in a pseudo-terminal because
    Brush only prints its progress bar to a terminal.
    """
    log("$ " + " ".join(str(c) for c in cmd))
    master, slave = pty.openpty()
    proc = subprocess.Popen([str(c) for c in cmd], stdin=subprocess.DEVNULL,
                            stdout=slave, stderr=slave)
    os.close(slave)
    buf, tail, last_line = "", [], None
    latest, stage_start, last_print = None, {}, time.time()
    while True:
        try:
            chunk = os.read(master, 65536)
        except OSError:  # the child closed the terminal
            break
        if not chunk:
            break
        # Progress bars redraw with \r, so treat it as a line break too.
        *lines, buf = re.split(r"[\r\n]", buf + ANSI.sub("", chunk.decode("utf8", "replace")))
        for line in lines:
            line = line.strip()
            if not line or line == last_line:
                continue
            last_line = line
            hit = progress(line) if progress else None
            if hit:
                latest = hit
                stage_start.setdefault(hit[0], time.time())
            else:  # progress redraws would bloat the log; everything else goes in
                tail = (tail + [line])[-30:]
                if LOG_FILE:
                    LOG_FILE.write(line + "\n")
        if latest and time.time() - last_print >= 5:
            stage, done, total = latest
            frac = done / total if total else 0
            took = time.time() - stage_start[stage]
            eta = f", ~{fmt_time(took / frac - took)} left" if 0.02 < frac < 1 else ""
            log(f"{stage} {100 * frac:.0f}% ({done}/{total}){eta}")
            last_print = time.time()
    os.close(master)
    code = proc.wait()
    if code != 0 and fatal:
        print("\n".join(tail))
        sys.exit(f"Command failed (exit {code}): {cmd[0]}. Full output is in the project's log.txt.")
    return code == 0


def colmap_progress(n_images: int):
    """COLMAP's automatic_reconstructor: feature extraction, matching, then the mapper."""
    def parse(line: str):
        if m := re.search(r"Processed file \[(\d+)/(\d+)\]", line):
            return "COLMAP features", int(m[1]), int(m[2])
        if m := re.search(r"block \[(\d+)/(\d+), (\d+)/(\d+)\]", line):
            a, na, b, nb = map(int, m.groups())
            return "COLMAP matching", (a - 1) * nb + b, na * nb
        if m := re.search(r"num_reg_(?:frames|images)=(\d+)", line):
            return "COLMAP poses", int(m[1]), n_images
        return None
    return parse


def trainer_progress(line: str):
    if m := re.search(r"(\d+)/(\d+)\s+Steps", line):  # Brush's progress bar
        return "Training", int(m[1]), int(m[2])
    return None


def require(binary: str, hint: str) -> str:
    local = Path(__file__).resolve().parent / "bin" / binary
    path = (shutil.which(binary) or (binary if Path(binary).expanduser().exists() else None)
            or (local if local.exists() else None))
    if not path:
        sys.exit(f"Can't find '{binary}'. {hint}")
    return str(Path(path).expanduser())


def sharpness(gray_small: np.ndarray) -> float:
    """Variance of the Laplacian: higher = sharper. Computed on a downscaled frame for speed."""
    return float(cv2.Laplacian(gray_small, cv2.CV_64F).var())


# ----------------------------------------------------------------------------- stage 1

def extract_frames(video: Path, out_dir: Path, target_fps: float, max_frames: int,
                   blur_percentile: float, max_dim: int) -> int:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        sys.exit(f"Could not open video: {video}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    duration = total / src_fps if total else 0

    # Window size (in source frames) so we end up with ~target_fps, capped by max_frames.
    wanted = int(duration * target_fps) if duration else max_frames
    if max_frames and wanted > max_frames:
        wanted = max_frames
    window = max(1, round(total / wanted)) if total and wanted else max(1, round(src_fps / target_fps))

    log(f"Video: {total} frames @ {src_fps:.2f} fps ({duration:.0f}s). "
        f"Keeping the sharpest frame of every {window} (~{total // window} candidates).")

    # Pass 1: score every frame, remember the best index in each window.
    best = {}  # window_id -> (score, frame_idx)
    idx = 0
    t0 = time.time()
    while True:
        ok = cap.grab()
        if not ok:
            break
        ok, frame = cap.retrieve()
        if not ok:
            break
        small = cv2.resize(frame, (960, int(960 * frame.shape[0] / frame.shape[1])),
                           interpolation=cv2.INTER_AREA)
        score = sharpness(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        w = idx // window
        if w not in best or score > best[w][0]:
            best[w] = (score, idx)
        idx += 1
        if idx % 500 == 0:
            rate = idx / (time.time() - t0)
            log(f"  scored {idx}/{total or '?'} frames ({rate:.0f} fps)")
    cap.release()

    picks = sorted(best.values(), key=lambda s: s[1])
    scores = np.array([s for s, _ in picks])

    # Drop windows whose *best* frame is still blurry (fast pans, prop wash shake, etc.).
    cutoff = np.percentile(scores, blur_percentile) if blur_percentile > 0 else -1
    keep = {i for s, i in picks if s >= cutoff}
    log(f"Sharpness median {np.median(scores):.1f}; dropping {len(picks) - len(keep)} "
        f"windows below the {blur_percentile:.0f}th percentile ({cutoff:.1f}).")

    # Pass 2: decode again and write only the chosen frames at full quality.
    out_dir.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(video))
    idx = written = 0
    while keep:
        ok = cap.grab()
        if not ok:
            break
        if idx in keep:
            ok, frame = cap.retrieve()
            if ok:
                if max_dim and max(frame.shape[:2]) > max_dim:
                    scale = max_dim / max(frame.shape[:2])
                    frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
                cv2.imwrite(str(out_dir / f"frame_{idx:06d}.jpg"), frame,
                            [cv2.IMWRITE_JPEG_QUALITY, 95])
                written += 1
            keep.discard(idx)
        idx += 1
    cap.release()
    log(f"Wrote {written} frames to {out_dir}")
    return written


# ----------------------------------------------------------------------------- stage 1b

PHOTO_EXTS = {".jpg", ".jpeg", ".png"}


def select_photos(src_dir: Path, out_dir: Path, max_frames: int,
                  blur_percentile: float, blur_ratio: float, max_dim: int) -> int:
    """Folder of interval photos: drop blurry ones, thin evenly to max_frames, resize, copy."""
    photos = sorted(p for p in src_dir.iterdir()
                    if p.is_file() and p.suffix.lower() in PHOTO_EXTS and not p.name.startswith("."))
    if not photos:
        sys.exit(f"No JPG/PNG photos found in {src_dir} (RAW .DNG files aren't used).")
    log(f"Found {len(photos)} photos. Scoring sharpness...")

    scored = []
    for i, p in enumerate(photos, 1):
        img = cv2.imread(str(p), cv2.IMREAD_REDUCED_GRAYSCALE_4)  # fast 1/4-size decode
        if img is None:
            log(f"  skipping unreadable {p.name}")
            continue
        scored.append((sharpness(img), p))
        if i % 100 == 0:
            log(f"  scored {i}/{len(photos)}")

    # The score depends on scene texture as much as on blur, so an absolute or percentile
    # cutoff throws away sharp photos of plain subjects. Compare each photo to the shots taken
    # just before/after it instead: those see nearly the same scene, so a big drop means blur.
    scores = np.array([s for s, _ in scored])
    cutoff = np.percentile(scores, blur_percentile) if blur_percentile > 0 else -1
    keep = []  # stays in capture (filename) order
    for i, (s, p) in enumerate(scored):
        near = np.concatenate([scores[max(0, i - 5):i], scores[i + 1:i + 6]])
        rel = s / np.median(near) if len(near) else 1.0
        if rel < blur_ratio or s < cutoff:
            log(f"  dropping blurry {p.name} (sharpness {s:.0f}, {rel:.2f}x its neighbours)")
        else:
            keep.append(p)
    log(f"Sharpness median {np.median(scores):.1f}; dropped {len(scored) - len(keep)} blurry "
        f"of {len(scored)}.")

    # Thin evenly across the whole flight so every orbit keeps coverage.
    if max_frames and len(keep) > max_frames:
        idx = np.linspace(0, len(keep) - 1, max_frames).round().astype(int)
        keep = [keep[i] for i in sorted(set(idx))]
        log(f"Thinned evenly to {len(keep)} photos for this quality level.")

    out_dir.mkdir(parents=True, exist_ok=True)
    # Carry the EXIF block over (OpenCV >= 4.12) so COLMAP can seed the focal length from it;
    # pixels are left in stored orientation so they still agree with the EXIF orientation tag.
    keep_exif = hasattr(cv2, "imreadWithMetadata")
    for p in keep:
        dst, params = str(out_dir / (p.stem + ".jpg")), [cv2.IMWRITE_JPEG_QUALITY, 95]
        if keep_exif:
            img, types, meta = cv2.imreadWithMetadata(
                str(p), cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
            exif = [m for t, m in zip(types, meta) if t == cv2.IMAGE_METADATA_EXIF]
        else:
            img, exif = cv2.imread(str(p)), []  # applies EXIF rotation
        if max_dim and max(img.shape[:2]) > max_dim:
            scale = max_dim / max(img.shape[:2])
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if exif:
            cv2.imwriteWithMetadata(dst, img, [cv2.IMAGE_METADATA_EXIF], exif, params)
        else:
            cv2.imwrite(dst, img, params)
    log(f"Wrote {len(keep)} photos to {out_dir}")
    return len(keep)


# ----------------------------------------------------------------------------- stage 2+3

def run_colmap(colmap: str, images: Path, work: Path, dataset: Path, quality: str,
               data_type: str = "video") -> None:
    if not (work / "sparse" / "0").exists():
        work.mkdir(parents=True, exist_ok=True)
        # data_type=video      -> sequential matching (fast, ideal for continuous footage)
        # data_type=individual -> exhaustive matching (photos; links overlapping orbits)
        # single_camera=1 -> one shared intrinsics model for the whole flight
        # use_gpu=0       -> COLMAP's GPU SIFT is CUDA/OpenGL-only; CPU is fine on an M4
        run([colmap, "automatic_reconstructor",
             "--workspace_path", work,
             "--image_path", images,
             "--data_type", data_type,
             "--quality", quality,
             "--single_camera", "1",
             "--camera_model", "OPENCV",
             "--sparse", "1",
             "--dense", "0",
             "--use_gpu", "0"],
            progress=colmap_progress(sum(1 for _ in images.glob("*.jpg"))))
    else:
        log("COLMAP model exists, skipping reconstruction.")

    if not (work / "sparse" / "0").exists():
        sys.exit("COLMAP produced no model. Usually means too little overlap, too much blur, "
                 "or lots of sky/water. Try a higher --fps or a slower flight.")

    # images.bin grows with the number of registered images, so the biggest one is the main model.
    models = sorted((m for m in (work / "sparse").iterdir() if (m / "images.bin").exists()),
                    key=lambda m: (m / "images.bin").stat().st_size, reverse=True)
    sparse_model = models[0]
    if len(models) > 1:
        log(f"WARNING: COLMAP split the scene into {len(models)} separate models; using the "
            f"largest ({sparse_model.name}). Gaps in coverage (e.g. a fast turn) usually cause this.")

    # COLMAP read GPS from the photos' EXIF into the database; fit the model to it (ENU frame:
    # x=east, y=north, z=up, meters, origin at the first photo). RANSAC ignores GPS glitches.
    aligned = work / "aligned"
    if not (aligned / "images.bin").exists():
        aligned.mkdir(exist_ok=True)
        run([colmap, "model_aligner",
             "--input_path", sparse_model,
             "--output_path", aligned,
             "--database_path", work / "database.db",
             "--ref_is_gps", "1",
             "--alignment_type", "enu",
             "--alignment_max_error", "3"], fatal=False)
    if (aligned / "images.bin").exists():
        sparse_model = aligned
    else:
        shutil.rmtree(aligned)
        log("WARNING: no usable GPS, so the model is unaligned: up and scale are arbitrary.")

    if not (dataset / "sparse").exists():
        run([colmap, "image_undistorter",
             "--image_path", images,
             "--input_path", sparse_model,
             "--output_path", dataset,
             "--output_type", "COLMAP"])
        # Some trainers expect sparse/0/, others sparse/. Provide both layouts.
        s = dataset / "sparse"
        if (s / "cameras.bin").exists() and not (s / "0").exists():
            (s / "0").mkdir()
            for f in ("cameras.bin", "images.bin", "points3D.bin"):
                shutil.copy2(s / f, s / "0" / f)
    else:
        log("Undistorted dataset exists, skipping.")


# ----------------------------------------------------------------------------- stage 4

def train(trainer: str, trainer_bin: str, dataset: Path, out_dir: Path, steps: int,
          max_dim: int) -> Path | None:
    out_dir.mkdir(parents=True, exist_ok=True)
    if trainer == "brush":
        # Checkpoint at least every 5000 steps so an interrupted run leaves something behind
        # (and the checkpoints show progress, since Brush prints none when piped). The interval
        # divides the step count so the last checkpoint is the finished splat.
        every = next(d for d in range(min(steps, 5000), 0, -1) if steps % d == 0)
        # Flags per Brush's CLI; run `brush_app --help` if your version differs.
        run([trainer_bin, dataset,
             "--total-steps", str(steps),
             "--max-resolution", str(max_dim),  # Brush caps at 1920 unless told otherwise
             "--export-every", str(every),
             "--export-path", out_dir], progress=trainer_progress)
    else:  # opensplat
        run([trainer_bin, dataset, "-n", str(steps), "-o", out_dir / "splat.ply"])
    plys = sorted(out_dir.glob("*.ply"), key=lambda p: p.stat().st_mtime)
    if not plys:
        log(f"Training finished but no .ply found in {out_dir}; check the trainer output above.")
        return None
    for old in plys[:-1]:  # earlier checkpoints are only useful if training dies
        old.unlink()
    log(f"Splat: {plys[-1]}")
    return plys[-1]


# ----------------------------------------------------------------------------- stage 5

def qvec_to_rotmat(qw: float, qx: float, qy: float, qz: float) -> np.ndarray:
    return np.array([
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)]])


def export_web(colmap: str, ply: Path, dataset: Path, out: Path, aligned: bool) -> None:
    """Compress the splat to .sog for the browser and write a .json of the drone viewpoints.

    The viewer is Y-up, so the ENU model (Z-up) is recentered on the house with the ground at
    y=0 and rotated -90 degrees about X: east -> +x, up -> +y, north -> -z.
    """
    npx = shutil.which("npx")
    if not npx:
        log("Skipping web export: needs Node.js (npx) for @playcanvas/splat-transform.")
        return
    txt = out.parent / (out.stem + "_model")
    txt.mkdir(parents=True, exist_ok=True)
    run([colmap, "model_converter", "--input_path", dataset / "sparse",
         "--output_path", txt, "--output_type", "TXT"])

    cam = open(txt / "cameras.txt").read().split("\n")
    cam = next(l.split() for l in cam if l and not l.startswith("#"))
    width, height, fy = int(cam[2]), int(cam[3]), float(cam[5])  # PINHOLE: fx fy cx cy
    views = []
    lines = [l for l in open(txt / "images.txt") if not l.startswith("#")]
    for l in lines[::2]:  # each image is a pose line followed by a keypoints line
        f = l.split()
        r = qvec_to_rotmat(*map(float, f[1:5]))
        center = -r.T @ np.array(list(map(float, f[5:8])))
        views.append((f[9], center, r[2]))  # r[2] = camera's forward axis in world coords
    views.sort(key=lambda v: v[0])  # capture order
    points = np.array([list(map(float, l.split()[1:4])) for l in open(txt / "points3D.txt")
                       if l.strip() and not l.startswith("#")])
    shutil.rmtree(txt)

    centers = np.array([c for _, c, _ in views])
    origin = np.median(centers, axis=0)
    reach = np.percentile(np.linalg.norm(centers - origin, axis=1), 90)
    if aligned:
        # Ground height: low percentile of the sparse points near the house.
        near = points[np.linalg.norm(points[:, :2] - origin[:2], axis=1) < reach]
        origin[2] = np.percentile(near[:, 2], 3)
        to_view = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], float)
    else:
        to_view = np.eye(3)  # unknown up; the viewer will look as COLMAP did
    radius = reach * 3  # keeps the yard and nearby trees, drops far-off junk

    out.parent.mkdir(parents=True, exist_ok=True)
    # splat-transform applies its actions in PlayCanvas's frame, which is the file's rotated
    # 180 degrees about Z (x and y negated) and writes the result back the same way. So to get
    # to_view @ (p - origin) in the file, translate by origin with z negated and rotate by +90.
    tx, ty, tz = (origin * [1, 1, -1]).round(4)
    run([npx, "-y", "@playcanvas/splat-transform@3", "-w", ply,
         "-t", f"{tx},{ty},{tz}",
         *(["-r", "90,0,0"] if aligned else []),
         "-N",
         "-S", f"0,0,0,{radius:.2f}",
         # Near-invisible splats cost as much to draw as visible ones, and the few huge ones
         # (mostly sky and far-off trees) cover the whole screen and tank the frame rate.
         "-V", "opacity,gte,0.02",
         *[a for i in range(3) for a in ("-V", f"scale_{i},lt,2")],
         out])

    # A small version the viewer shows within seconds while the full one downloads: the
    # 400k splats that matter most, without the view-dependent color (SH) bands.
    preview = out.with_name(out.stem + "-preview.sog")
    tmp = out.with_name(out.stem + "-preview.ply")
    run([npx, "-y", "@playcanvas/splat-transform@3", "-w", out,
         "-H", "0", "--decimate-adaptive", "400000", tmp])
    run([npx, "-y", "@playcanvas/splat-transform@3", "-w", tmp, preview])
    tmp.unlink()

    meta = {
        "aligned": aligned,
        "preview": preview.name,
        "fov": round(float(np.degrees(2 * np.arctan(height / 2 / fy))), 2),  # vertical
        "aspect": round(width / height, 4),
        "radius": round(float(reach), 2),
        "views": [{"name": Path(n).stem,
                   "pos": [round(float(x), 3) for x in to_view @ (c - origin)],
                   "fwd": [round(float(x), 4) for x in to_view @ d]} for n, c, d in views],
    }
    # Keep a hand-picked starting view (copied from a Share link) across re-exports.
    old = out.with_suffix(".json")
    if old.exists() and "start" in (prev := json.loads(old.read_text())):
        meta["start"] = prev["start"]
    out.with_suffix(".json").write_text(json.dumps(meta))
    log(f"Done! Web splat: {out} ({out.stat().st_size / 1e6:.1f} MB) + {out.with_suffix('.json').name}")


# ----------------------------------------------------------------------------- main

# Rough M4 Pro timings for a ~5 min flight; actual time depends on your chip, RAM and footage.
PRESETS = {
    "draft":    dict(fps=1.0, max_frames=150, max_dim=1600, colmap_quality="medium", steps=7000,
                     desc="quick preview, ~10-20 min"),
    "standard": dict(fps=2.0, max_frames=300, max_dim=1920, colmap_quality="high",   steps=30000,
                     desc="good result, ~1-2 hr"),
    "high":     dict(fps=3.0, max_frames=500, max_dim=2880, colmap_quality="high",   steps=30000,
                     desc="sharper detail, ~3-5 hr"),
    "max":      dict(fps=4.0, max_frames=800, max_dim=3840, colmap_quality="extreme", steps=50000,
                     desc="full 4K, overnight (8+ hr)"),
}


def main() -> None:
    p = argparse.ArgumentParser(description="Drone video or photo folder -> Gaussian splat on Apple Silicon")
    p.add_argument("input", type=Path, help="A video file, or a folder of interval photos")
    p.add_argument("-o", "--out", type=Path,
                   help="Project folder (default: <video>_splat_<quality> next to the video, "
                        "or splat_<quality> inside the photo folder)")
    p.add_argument("-q", "--quality", default="standard", choices=list(PRESETS),
                   help="Preset that sets all the knobs below (default: standard). "
                        + "; ".join(f"{k}: {v['desc']}" for k, v in PRESETS.items()))
    p.add_argument("--fps", type=float, help="Video only: frames per second to keep (overrides preset)")
    p.add_argument("--max-frames", type=int, help="Hard cap on frames kept (overrides preset)")
    p.add_argument("--blur-percentile", type=float,
                   help="Drop the blurriest N%% of chosen frames (default: 10 for video, "
                        "0 = disabled for photos)")
    p.add_argument("--blur-ratio", type=float, default=0.4,
                   help="Photos only: drop a photo whose sharpness is below this fraction of "
                        "its neighbours' (default 0.4, 0 to keep everything)")
    p.add_argument("--max-dim", type=int,
                   help="Long edge of saved frames in pixels, e.g. 1920 or 3840 (overrides preset)")
    p.add_argument("--colmap-quality", choices=["low", "medium", "high", "extreme"],
                   help="COLMAP feature/matching thoroughness (overrides preset)")
    p.add_argument("--trainer", default="brush", choices=["brush", "opensplat"])
    p.add_argument("--trainer-bin", help="Path to the trainer binary (default: brush_app / opensplat on PATH)")
    p.add_argument("--steps", type=int, help="Training iterations (overrides preset)")
    p.add_argument("--web-out", type=Path,
                   help="Where to write the web .sog (default: <project>/web/scene.sog); "
                        "a .json of viewpoints is written next to it")
    p.add_argument("--no-web", action="store_true", help="Skip the web export")
    p.add_argument("--force", action="store_true", help="Redo every stage from scratch")
    a = p.parse_args()

    # Fill anything not set explicitly from the chosen preset.
    preset = PRESETS[a.quality]
    for key in ("fps", "max_frames", "max_dim", "colmap_quality", "steps"):
        if getattr(a, key) is None:
            setattr(a, key, preset[key])
    log(f"Quality '{a.quality}' ({preset['desc']}): fps={a.fps}, max_frames={a.max_frames}, "
        f"max_dim={a.max_dim}, colmap={a.colmap_quality}, steps={a.steps}")

    src = a.input.expanduser()
    if not src.exists():
        sys.exit(f"No such file or folder: {src}")
    is_photos = src.is_dir()
    if a.blur_percentile is None:
        a.blur_percentile = 0 if is_photos else 10

    colmap = require("colmap", "Install with: brew install colmap")
    default_bin = "brush_app" if a.trainer == "brush" else "opensplat"
    trainer_bin = require(a.trainer_bin or default_bin,
                          "Download Brush from its GitHub releases page, or pass --trainer-bin.")

    if a.out:
        proj = a.out.expanduser()
    elif is_photos:
        proj = src / f"splat_{a.quality}"   # subfolder; the photo scan ignores subfolders
    else:
        proj = src.with_name(f"{src.stem}_splat_{a.quality}")
    images, work, dataset, out = (proj / "frames", proj / "colmap",
                                  proj / "dataset", proj / "output")
    if a.force and proj.exists():
        shutil.rmtree(proj)

    proj.mkdir(parents=True, exist_ok=True)
    global LOG_FILE
    LOG_FILE = open(proj / "log.txt", "a")
    log(f"Project folder: {proj} (full tool output goes to log.txt)")
    # Keep the Mac from sleeping until this script exits (closing the lid still sleeps it).
    if shutil.which("caffeinate"):
        subprocess.Popen(["caffeinate", "-is", "-w", str(os.getpid())])
    if images.exists() and any(images.glob("*.jpg")):
        log(f"Frames exist ({len(list(images.glob('*.jpg')))}), skipping extraction.")
    else:
        if is_photos:
            n = select_photos(src, images, a.max_frames, a.blur_percentile, a.blur_ratio, a.max_dim)
        else:
            n = extract_frames(src, images, a.fps, a.max_frames, a.blur_percentile, a.max_dim)
        if n < 30:
            sys.exit("Fewer than 30 usable frames; that's too few for a good reconstruction.")

    run_colmap(colmap, images, work, dataset, a.colmap_quality,
               data_type="individual" if is_photos else "video")
    ply = train(a.trainer, trainer_bin, dataset, out, a.steps, a.max_dim)
    if ply and not a.no_web:
        export_web(colmap, ply, dataset, (a.web_out or proj / "web" / "scene.sog").expanduser(),
                   aligned=(work / "aligned").exists())


if __name__ == "__main__":
    main()
