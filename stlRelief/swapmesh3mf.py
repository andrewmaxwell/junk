# Put a new mesh into an existing Bambu Studio project, keeping every setting:
#   swapmesh3mf.py <project.3mf> <object part name, e.g. tile.stl> <new.stl>
# The project stores each part's mesh minus its source_offset; the new mesh needs the same footprint, on z=0.
import sys, zipfile, os, re, numpy as np, trimesh
path, name, stl = sys.argv[1:4]
t = trimesh.load(stl)
with zipfile.ZipFile(path) as z:
    files = {i.filename: z.read(i.filename) for i in z.infolist()}; infos = z.infolist()
cfg = files['Metadata/model_settings.config'].decode()
part = re.search(r'<object id="(\d+)">.*?<part id="(\d+)".*?key="name" value="' + re.escape(name) + r'".*?</part>', cfg, re.S)
off = np.array([float(re.search(f'source_offset_{a}" value="([-\\d.e]+)"', part.group(0)).group(1)) for a in 'xyz'])
center = t.bounds.mean(0)
assert np.allclose(center[:2], off[:2], atol=0.01) and abs(t.bounds[0][2]) < 1e-3, (center, off)   # same footprint, sitting on z=0
pid = part.group(2)
mpath = next(k for k in files if k.startswith('3D/Objects/') and f'id="{pid}"' in files[k].decode()[:2000])
v = t.vertices - off
xml = files[mpath].decode()
head = xml[:xml.index('<vertices>')]; tail = xml[xml.index('</triangles>') + len('</triangles>'):]
vs = '\n'.join(f'     <vertex x="{a:.7g}" y="{b:.7g}" z="{c:.7g}"/>' for a, b, c in v)
ts = '\n'.join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in t.faces)
files[mpath] = (head + '<vertices>\n' + vs + '\n    </vertices>\n    <triangles>\n' + ts + '\n    </triangles>' + tail).encode()
old_n = re.search(r'face_count="(\d+)"', part.group(0)).group(1)
obj = re.search(r'<object id="' + part.group(1) + r'">.*?</object>', cfg, re.S).group(0)
files['Metadata/model_settings.config'] = cfg.replace(obj, obj.replace(f'face_count="{old_n}"', f'face_count="{len(t.faces)}"')).encode()
tmp = path + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
    for i in infos: z.writestr(i, files[i.filename], compress_type=zipfile.ZIP_DEFLATED)
os.replace(tmp, path)
print(name, old_n, '->', len(t.faces), 'triangles in', mpath)
