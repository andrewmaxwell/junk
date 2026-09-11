import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
from matplotlib.patches import PathPatch
from plate_lib import geom_to_mpl_path
import build_frame as bf

HERE = os.path.dirname(os.path.abspath(__file__))
img = mpimg.imread(os.path.join(HERE, 'missouri_plate_sample.png'))

fig, ax = plt.subplots(figsize=(12,9), dpi=150)
# plate sits at x=[RIM_SIDE, RIM_SIDE+PLATE_W], y=[BOTTOM_EXT, BOTTOM_EXT+PLATE_H]
ax.imshow(img, extent=[bf.RIM_SIDE, bf.RIM_SIDE+bf.PLATE_W, bf.BOTTOM_EXT, bf.BOTTOM_EXT+bf.PLATE_H],
          zorder=1, aspect='auto')

# frame material (white, semi-transparent so we can see what's underneath it)
path = geom_to_mpl_path(bf.frame_outline)
ax.add_patch(PathPatch(path, facecolor='white', edgecolor='none', alpha=0.75, zorder=3))

# colored elements on top, fully opaque
for geom, color in [(bf.red_all, '#e2231a'), (bf.black_all,'#1a1a1a'), (bf.green_all,'#1c7a3c')]:
    p = geom_to_mpl_path(geom)
    if p: ax.add_patch(PathPatch(p, facecolor=color, edgecolor='none', zorder=4))

# outline of the opening, for clarity
op = geom_to_mpl_path(bf.opening)
ax.add_patch(PathPatch(op, facecolor='none', edgecolor='#0080ff', lw=1.2, ls='--', zorder=5))

ax.set_xlim(-5, bf.OUTER_W+5)
ax.set_ylim(-5, bf.OUTER_H+5)
ax.set_aspect('equal')
ax.axis('off')
plt.savefig(os.path.join(HERE, 'verify_overlay.png'), bbox_inches='tight', facecolor='#dcdcdc')
print("saved verify_overlay.png")
