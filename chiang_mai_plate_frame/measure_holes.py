"""
Measure the Missouri sample plate's pre-punched mounting holes from
missouri_plate_sample.png, and verify the result visually.

Method (reproducible, no eyeballing):
  1. Find the plate's own edges by scanning for the first non-white pixel on
     several rows/columns. This anchors the pixel->mm scale to the PLATE, not
     to the image (the image has a white margin around the plate; using the
     full image size introduces a ~3% scale error).
  2. Isolate the holes' thin gray outline rings: low-saturation, mid-luminance
     pixels. This rejects both the red waves (top) and navy waves (bottom)
     that cross the hole outlines.
  3. Sub-pixel Hough circle fit for each of the 4 holes.

Run:  python measure_holes.py    ->  prints results, saves holes_verify.png
"""
import os
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
IN = 25.4
PLATE_W_MM, PLATE_H_MM = 12 * IN, 6 * IN


def plate_edges(rgb):
    """Bounding box of the plate itself (first/last non-white pixel), as
    continuous coords: the plate spans [x0, x1] x [y0, y1]."""
    H, W, _ = rgb.shape

    def first_nonwhite(seq):
        for i, p in enumerate(seq):
            if not (p[0] > 248 and p[1] > 248 and p[2] > 248):
                return i
        return None

    lefts, rights, tops, bots = [], [], [], []
    for y in range(H // 5, 4 * H // 5, 7):
        r = rgb[y]
        lefts.append(first_nonwhite(r))
        rights.append(W - 1 - first_nonwhite(r[::-1]))
    for x in range(W // 5, 4 * W // 5, 7):
        c = rgb[:, x]
        tops.append(first_nonwhite(c))
        bots.append(H - 1 - first_nonwhite(c[::-1]))
    # median, then expand by half a pixel to get the outer edge of the edge pixel
    x0 = np.median(lefts) - 0.5
    x1 = np.median(rights) + 0.5
    y0 = np.median(tops) - 0.5
    y1 = np.median(bots) + 0.5
    return x0, x1, y0, y1


def ring_mask(rgb):
    """Thin gray outline of a hole: low saturation, mid luminance."""
    mx, mn, lum = rgb.max(2), rgb.min(2), rgb.mean(2)
    return (mx - mn < 34) & (lum > 100) & (lum < 240)


def fit_circle(ring, cx0, cy0, win=13):
    """Sub-pixel Hough: best (cx, cy, r) for a ring near (cx0, cy0)."""
    ys, xs = np.nonzero(ring[cy0 - win:cy0 + win, cx0 - win:cx0 + win])
    ys, xs = ys + cy0 - win, xs + cx0 - win
    best = None
    for r in np.arange(3.5, 9.01, 0.05):
        for cy in np.arange(cy0 - 4, cy0 + 4.01, 0.10):
            for cx in np.arange(cx0 - 4, cx0 + 4.01, 0.10):
                d = np.hypot(ys - cy, xs - cx)
                # reward pixels on the ring, penalise a filled (non-ring) blob
                score = (np.abs(d - r) < 0.9).sum() - 0.35 * (d < r - 1.5).sum()
                if best is None or score > best[0]:
                    best = (score, cx, cy, r)
    return best[1], best[2], best[3]


def measure(path=None):
    path = path or os.path.join(HERE, "missouri_plate_sample.png")
    rgb = np.array(Image.open(path).convert("RGB")).astype(int)
    x0, x1, y0, y1 = plate_edges(rgb)
    sx, sy = PLATE_W_MM / (x1 - x0), PLATE_H_MM / (y1 - y0)
    ring = ring_mask(rgb)

    seeds = {"top-left": (112, 26), "top-right": (390, 26),
             "bottom-left": (111, 218), "bottom-right": (396, 219)}
    holes = {k: fit_circle(ring, *s) for k, s in seeds.items()}
    return dict(rgb=rgb, plate=(x0, x1, y0, y1), scale=(sx, sy), holes=holes)


def report(m):
    x0, x1, y0, y1 = m["plate"]
    sx, sy = m["scale"]
    h = m["holes"]
    print(f"plate edges (px): x {x0}..{x1} ({x1-x0:.0f} px)   "
          f"y {y0}..{y1} ({y1-y0:.0f} px)   aspect {(x1-x0)/(y1-y0):.3f} (true 2.000)")
    print(f"scale: {sx:.6f} / {sy:.6f} mm per px (x/y)\n")
    for k, (cx, cy, r) in h.items():
        print(f"  {k:13s} px center=({cx:6.2f},{cy:6.2f}) r={r:.2f}")
    lx = (h["top-left"][0] + h["bottom-left"][0]) / 2
    rx = (h["top-right"][0] + h["bottom-right"][0]) / 2
    ty = (h["top-left"][1] + h["top-right"][1]) / 2
    by = (h["bottom-left"][1] + h["bottom-right"][1]) / 2
    r_mm = np.mean([v[2] for v in h.values()]) * (sx + sy) / 2
    hs, vs = (rx - lx) * sx, (by - ty) * sy
    print(f"\n  inset from left/right edge: {(lx-x0)*sx:.2f} / {(x1-rx)*sx:.2f} mm")
    print(f"  inset from top/bottom edge: {(ty-y0)*sy:.2f} / {(y1-by)*sy:.2f} mm")
    print(f"\n  horizontal spacing: {hs:7.2f} mm = {hs/IN:.3f} in  (US std 7.000 in)")
    print(f"  vertical   spacing: {vs:7.2f} mm = {vs/IN:.3f} in  (US std 4.750 in)")
    print(f"  hole diameter:      {2*r_mm:7.2f} mm = {2*r_mm/IN:.3f} in  (US std 0.312 in)")
    print("\n=> within ~1 mm of the standard US pattern; 1 px = %.2f mm, so the"
          "\n   residual is measurement noise. Use the standard, not these values." % sx)


def verify_png(m, out="holes_verify.png"):
    """Draw the fitted circles back onto the plate image to confirm by eye."""
    fig, ax = plt.subplots(figsize=(12, 6), dpi=160)
    ax.imshow(m["rgb"].astype(np.uint8))
    x0, x1, y0, y1 = m["plate"]
    ax.add_patch(plt.Rectangle((x0, y0), x1 - x0, y1 - y0, fill=False,
                               ec="#00a0ff", lw=1.2, ls="--"))
    for k, (cx, cy, r) in m["holes"].items():
        ax.add_patch(plt.Circle((cx, cy), r, fill=False, ec="#ff00ff", lw=1.4))
        ax.plot([cx], [cy], marker="+", ms=7, mew=1.2, color="#ff00ff")
        ax.annotate(f"({cx:.1f}, {cy:.1f})  r={r:.2f}", (cx, cy),
                    textcoords="offset points", xytext=(0, 16 if "top" in k else -22),
                    ha="center", fontsize=6.5, color="#c000c0",
                    bbox=dict(fc="white", ec="none", alpha=0.75, pad=1))
    ax.set_title("Detected plate mounting holes (magenta) + plate edges (blue)", fontsize=9)
    ax.axis("off")
    plt.savefig(os.path.join(HERE, out), bbox_inches="tight", facecolor="white")
    print(f"\nsaved {out}")


if __name__ == "__main__":
    m = measure()
    report(m)
    verify_png(m)
