# One printable tile straight from the USGS lidar point cloud, centered on a point:
#   tile.py <lon> <lat> <m_per_mm> <width_mm> <height_mm> <out_dir>
# Writes <out_dir>/tile.stl (with sockets for the Arch's legs, if it's on the tile) and <out_dir>/arch.stl
# (the Arch, printed lying flat). See wall.py for the whole wall in matching tiles.
import numpy as np, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import relief, archflat
from relief import PX
from terrace import terrace_solid

lon, lat, M, Wmm, Hmm, out = *map(float, sys.argv[1:6]), sys.argv[6]
os.makedirs(out, exist_ok=True)
nx, ny = int(round(Wmm / PX)) * 2 + 2, int(round(Hmm / PX)) * 2 + 2
h, arch = relief.heights(lon, lat, M, nx, ny)
h = h[:ny // 2 * 2 + 1, :nx // 2 * 2 + 1]
print('height', h.min().round(2), '..', h.max().round(2), 'mm', flush=True)
model = terrace_solid(h.astype(np.float64), relief.PXC)
if 0 <= arch[0] < h.shape[1] and 0 <= arch[1] < h.shape[0]:
    model = relief.add_sockets(model, h, arch, M)
relief.save(model, f'{out}/tile.stl')
print('arch', archflat.write_stl(f'{out}/arch.stl', M, relief.BEXAG).round(2), 'mm')
