# Make a one-tile Bambu Studio project from a saved project, keeping all of its settings:
#   project3mf.py <template.3mf> <tile.stl> <out.3mf> [name]
# The template's first object becomes the tile (centered on the bed); any other objects (the Arch) are dropped.
import sys, zipfile, re, os, numpy as np, trimesh
tpl, stl, out = sys.argv[1:4]; name = sys.argv[4] if len(sys.argv) > 4 else os.path.basename(stl)
BED = (128.0, 128.0)
t = trimesh.load(stl)
with zipfile.ZipFile(tpl) as z:
    infos = z.infolist(); files = {i.filename: z.read(i.filename).decode('utf-8', 'surrogateescape') for i in infos}
model, cfg = files['3D/3dmodel.model'], files['Metadata/model_settings.config']
keep = re.search(r'<item objectid="(\d+)"', model).group(1)              # first build item: the tile
for oid in re.findall(r'<item objectid="(\d+)"', model):
    if oid == keep: continue
    comp = re.search(r'<object id="' + oid + r'"[^>]*>.*?</object>\s*', model, re.S)
    path = re.search(r'p:path="/([^"]+)"', comp.group(0)).group(1)
    model = model.replace(comp.group(0), '')
    model = re.sub(r'\s*<item objectid="' + oid + r'"[^>]*/>', '', model)
    files.pop(path)
    files['3D/_rels/3dmodel.model.rels'] = re.sub(r'\s*<Relationship Target="/' + re.escape(path) + r'"[^>]*/>', '', files['3D/_rels/3dmodel.model.rels'])
    cfg = re.sub(r'\s*<object id="' + oid + r'">.*?</object>', '', cfg, flags=re.S)
    cfg = re.sub(r'\s*<model_instance>\s*<metadata key="object_id" value="' + oid + r'"/>.*?</model_instance>', '', cfg, flags=re.S)
    cfg = re.sub(r'\s*<assemble_item object_id="' + oid + r'"[^>]*/>', '', cfg)
files.pop('Metadata/plate_1.json', None)   # stale preview data; the app rebuilds it
# the tile's mesh, stored relative to its offset (the mesh's center, bottom at z=0 after placement)
lo, hi = t.bounds; off = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (hi[2] - lo[2]) / 2])
v = t.vertices - [off[0], off[1], lo[2] + off[2]]
path = re.search(r'<object id="' + keep + r'"[^>]*>.*?p:path="/([^"]+)"', model, re.S).group(1)
xml = files[path]
head = xml[:xml.index('<vertices>')]; tail = xml[xml.index('</triangles>') + len('</triangles>'):]
vs = '\n'.join(f'     <vertex x="{a:.7g}" y="{b:.7g}" z="{c:.7g}"/>' for a, b, c in v)
ts = '\n'.join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in t.faces)
files[path] = head + '<vertices>\n' + vs + '\n    </vertices>\n    <triangles>\n' + ts + '\n    </triangles>' + tail
place = f'1 0 0 0 1 0 0 0 1 {BED[0]} {BED[1]} {off[2]:.7g}'
model = re.sub(r'(<item objectid="' + keep + r'"[^>]*transform=")[^"]*', r'\g<1>' + place, model)
obj = re.search(r'<object id="' + keep + r'">.*?</object>', cfg, re.S).group(0)
o2 = re.sub(r'(key="name" value=")[^"]*', r'\g<1>' + name, obj)
o2 = re.sub(r'(key="source_file" value=")[^"]*', r'\g<1>' + name + '.stl', o2)
o2 = re.sub(r'face_count="\d+"', f'face_count="{len(t.faces)}"', o2)
for a, val in zip('xyz', off): o2 = re.sub(f'(source_offset_{a}" value=")[^"]*', r'\g<1>' + f'{val:.9g}', o2)
o2 = re.sub(r'(key="matrix" value=")[^"]*', r'\g<1>' + f'1 0 0 {off[0]:.9g} 0 1 0 {off[1]:.9g} 0 0 1 {off[2]:.9g} 0 0 0 1', o2)
cfg = cfg.replace(obj, o2)
cfg = re.sub(r'(<assemble_item object_id="' + keep + r'" instance_id="0" transform=")[^"]*', r'\g<1>' + place, cfg)
files['3D/3dmodel.model'], files['Metadata/model_settings.config'] = model, cfg
tmp = out + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as z:
    for i in infos:
        if i.filename in files: z.writestr(i, files[i.filename].encode('utf-8', 'surrogateescape'), compress_type=zipfile.ZIP_DEFLATED)
os.replace(tmp, out)
print(os.path.basename(out), len(t.faces), 'triangles', (hi - lo).round(1), 'mm')
