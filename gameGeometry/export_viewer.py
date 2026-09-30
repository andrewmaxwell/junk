#!/usr/bin/env python3
"""Export SSX 3 terrain and placed objects into a streaming HTML 3D viewer.

    python3 export_viewer.py                 # -> out/viewer/index.html
    python3 export_viewer.py --no-objects    # terrain only

The viewer opens straight from disk (file://). index.html starts with a
low-detail overview of the whole mountain (data/overview.js) and loads each
location's full terrain, objects, textures and baked lighting on demand
(data/<location>.js, data/textures.js) as the camera gets close. Data files
are gzipped binary packs wrapped in a script call, since browsers won't
fetch() local files but will load local <script>s.
"""
import argparse
import base64
import gzip
import json
import os
import shutil
import struct
import sys
from array import array

from list_geometry import COURSE_NAMES, DEFAULT_ISO, describe, peak
from rvz import GCDisc
import gxtex
import ssx3

HERE = os.path.dirname(os.path.abspath(__file__))
OVERVIEW_STEPS = 2  # patch tessellation for the far-away overview


def to_viewer(p):
    """Game coordinates are Z-up; the viewer is Y-up."""
    return (p[0], p[2], -p[1])


def is_panel(model):
    """Big flat cards, alone or stacked in parallel: backdrops and tree lines
    that rely on see-through textures and look like solid walls without them."""
    if not model.verts:
        return False
    size = max(max(p[k] for p in model.verts) - min(p[k] for p in model.verts) for k in range(3))
    if size < 300:
        return False
    normals = []
    for t in model.tris:
        a, b, c = (model.verts[i] for i in t)
        u = [b[k] - a[k] for k in range(3)]
        v = [c[k] - a[k] for k in range(3)]
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        length = sum(x * x for x in n) ** 0.5
        if length > 1e-6:
            normals.append([x / length for x in n])
    # every face parallel to the first (either side)
    return bool(normals) and all(abs(sum(p * q for p, q in zip(n, normals[0]))) > 0.99 for n in normals)


def texture_payload(tex):
    """Top mip level only, still in GameCube form; the page decodes it.
    -> (kind, width, height, pixel bytes, palette bytes)"""
    kind = tex[0]
    w, h = struct.unpack_from('>HH', tex, 4)
    if kind == 0x1E:  # CMPR, 4 bits per pixel
        return kind, w, h, tex[0x20:0x20 + w * h // 2], b''
    nxt = int.from_bytes(tex[1:4], 'big')  # C8 + RGB5A3 palette
    count = struct.unpack_from('>H', tex, nxt + 4)[0]
    return kind, w, h, tex[0x20:0x20 + w * h], tex[nxt + 0x20:nxt + 0x20 + 2 * count]


def is_helper_texture(tex):
    """One flat, saturated, mostly see-through colour (orange, purple, green):
    editor-style markers on volumes the game never draws."""
    kind, w, h = tex[0], *struct.unpack_from('>HH', tex, 4)
    if kind != 0x19 or w * h > 4096:  # only small paletted textures carry translucency
        return False
    _, _, px = gxtex.decode(tex)
    if max(max(px[i::4]) - min(px[i::4]) for i in range(3)) > 8:
        return False
    r, g, b, _ = px[:4]
    alpha = sum(px[3::4]) / (w * h)
    saturation = (max(r, g, b) - min(r, g, b)) / max(r, g, b, 1)
    return alpha < 128 and saturation > 0.3


def is_placeholder_texture(tex):
    """A tiny image of one flat dark colour. Real textures always have detail; these mark
    placeholder objects (point-multiplier cubes, black slabs by jumps) that the game draws
    with effects at runtime or not at all."""
    w, h = struct.unpack_from('>HH', tex, 4)
    if w * h > 256:
        return False
    _, _, px = gxtex.decode(tex)
    if max(max(px[i::4]) - min(px[i::4]) for i in range(4)) > 8:
        return False
    return sum(px[:3]) / 3 < 60 and px[3] > 250


# Editor textures no rule can spot: 345 is an arrow with corners numbered 1-4 (an orientation
# test pattern) on boxes floating over the CHP2 superpipes.
EDITOR_TEXTURES = {345}

# model categories in the viewer
OBJECT, PANEL, PLACEHOLDER, BLOCK = 0, 1, 2, 3


def is_plain_block(model):
    """A bare closed box (12 triangles, 8 corners) at least 2000 units on a side, e.g. the
    snow/ice slabs standing on ARA1's slopes. Probably invisible blockers, but the textures
    are real ones, so these get their own toggle rather than joining the helpers."""
    if len(model.meshes) != 1 or len(model.tris) != 12:
        return False
    if len({tuple(round(c) for c in v) for v in model.verts}) != 8:
        return False
    return max(max(v[k] for v in model.verts) - min(v[k] for v in model.verts) for k in range(3)) >= 2000


class Pack:
    """Named binary sections plus JSON metadata, gzipped into one blob."""

    def __init__(self, meta=None):
        self.meta = meta if meta is not None else {}
        self.sections = {}

    def add(self, name, data):
        if isinstance(data, array):
            if sys.byteorder != 'little':
                data = array(data.typecode, data)
                data.byteswap()
            data = data.tobytes()
        self.sections[name] = bytes(data)

    def write(self, path, key):
        body, index = bytearray(), {}
        for name, data in self.sections.items():
            body += bytes(-len(body) % 8)  # keep typed-array views aligned
            index[name] = [len(body), len(data)]
            body += data
        header = json.dumps({'meta': self.meta, 'sections': index}, separators=(',', ':')).encode()
        header += b' ' * (-(len(header) + 4) % 8)
        blob = gzip.compress(struct.pack('<I', len(header)) + header + body, 6)
        with open(path, 'w') as f:
            f.write(f'ssxData({json.dumps(key)},"{base64.b64encode(blob).decode()}");\n')
        return os.path.getsize(path)


def overview_grid(patch, steps):
    """Low-detail grid points of a patch, as (s, t, game xyz)."""
    out = []
    for a in range(steps + 1):
        for b in range(steps + 1):
            s, t = a / steps, b / steps
            out.append((s, t, patch.eval(s, t)))
    return out


def baked_color(tex_avg, lightmap, patch, s, t):
    """Approximate the game's look at one point: texture colour x lightmap x 2."""
    lu, lv, lw, lh = patch.lightmap_rect
    w, h = struct.unpack_from('>HH', lightmap, 4)
    # the patch's first parameter runs along the lightmap's v axis
    x = min(w - 1, max(0, int((lu + t * lw) * w)))
    y = min(h - 1, max(0, int((lv + s * lh) * h)))
    light = gxtex.cmpr_pixel(lightmap, x, y)
    return tuple(min(255, tex_avg[i] * light[i] * 2 // 255) for i in range(3))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image', nargs='?', default=DEFAULT_ISO)
    ap.add_argument('--no-objects', action='store_true', help='leave out placed prefab models')
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'viewer'))
    args = ap.parse_args()

    disc = GCDisc(args.image)
    print('Decoding world...', file=sys.stderr)
    world = ssx3.World(disc.read_file('data/worlds/bam.big'))
    bank, lightmap_bank, color_pools = world.textures(), world.lightmaps(), world.color_pools()
    models = {} if args.no_objects else world.models()
    tex_avg = {tid: gxtex.average(d) for tid, d in bank.items()}
    placeholders = {tid for tid, d in bank.items() if is_placeholder_texture(d)}

    data_dir = os.path.join(args.out, 'data')
    shutil.rmtree(data_dir, ignore_errors=True)
    os.makedirs(data_dir)

    used_textures = set()
    locations = []
    overview_pos, overview_col = [], array('B')  # viewer-space points, baked RGB
    total_bytes = 0

    for track in world.tracks():
        name = world.location_name(track)
        patches = sorted(world.patches(track), key=lambda p: (p.texture, p.lightmap))
        instances = [i for i in world.instances(track) if i.model in models]
        if not patches and not instances:
            continue
        pack = Pack()

        # terrain: bicubic coefficients, tessellated in the page
        lightmap_ids, runs = {}, []  # runs: [texture id, local lightmap index, patch count]
        coefs, uvs, lm_rects = array('f'), array('f'), array('f')
        for p in patches:
            lm = lightmap_ids.setdefault(p.lightmap, len(lightmap_ids)) if p.lightmap in lightmap_bank else -1
            tid = p.texture if p.texture in bank else -1
            used_textures.add(tid)
            if runs and runs[-1][:2] == [tid, lm]:
                runs[-1][2] += 1
            else:
                runs.append([tid, lm, 1])
            coefs.extend(c for xyz in p.coef for c in xyz)
            uvs.extend(p.uv_corners)
            lm_rects.extend(p.lightmap_rect)
            # overview: a few points per patch, coloured like the game would draw them
            for s, t, xyz in overview_grid(p, OVERVIEW_STEPS):
                overview_pos.append(to_viewer(xyz))
                if p.lightmap in lightmap_bank and p.texture in tex_avg:
                    overview_col.extend(baked_color(tex_avg[p.texture], lightmap_bank[p.lightmap], p, s, t))
                else:
                    overview_col.extend((200, 200, 200))
        pack.add('coefs', coefs)
        pack.add('patchUv', uvs)
        pack.add('patchLm', lm_rects)

        lm_bytes, lightmaps = bytearray(), []
        for lid in lightmap_ids:  # insertion order == local index
            kind, w, h, pixels, _ = texture_payload(lightmap_bank[lid])
            lightmaps.append([kind, w, h, len(lm_bytes), len(pixels)])
            lm_bytes += pixels
        pack.add('lightmaps', lm_bytes)

        # objects: each model once, then its placements
        model_ids, model_meta = {}, []
        verts, muvs, cols, tris = array('h'), array('h'), array('H'), array('H')
        pool_ids, pool_bytes, pools = {}, bytearray(), []
        inst = array('f')  # model index, 12 matrix floats (3 columns x 4 rows), pool index, byte offset
        points = [to_viewer(ssx3.transform((0, 0, 0), i.matrix)) for i in instances]
        for i in instances:
            if i.model not in model_ids:
                m = models[i.model]
                model_ids[i.model] = len(model_meta)
                meshes = []
                for mesh in m.meshes:
                    tid = m.textures[mesh.material] if mesh.material < len(m.textures) else None
                    tid = tid if tid in bank else -1
                    used_textures.add(tid)
                    # positions quantized to 16 bits across each mesh's own bounds
                    lo = [min(v[k] for v in mesh.verts) for k in range(3)]
                    scale = [max((max(v[k] for v in mesh.verts) - lo[k]) / 65535, 1e-6) for k in range(3)]
                    verts.extend(round((v[k] - lo[k]) / scale[k]) - 32768 for v in mesh.verts for k in range(3))
                    muvs.extend(max(-32768, min(32767, round(c * 4096))) for uv in mesh.uvs for c in uv)
                    cols.extend(mesh.colors)
                    tris.extend(k for t in mesh.tris for k in t)
                    meshes.append([tid, len(mesh.verts), len(mesh.tris), *lo, *scale])
                if any(t in placeholders for t in m.textures):
                    category = PLACEHOLDER
                elif is_plain_block(m):
                    category = BLOCK
                else:
                    category = PANEL if is_panel(m) else OBJECT
                model_meta.append([category, meshes])
            if i.color_pool not in pool_ids and i.color_pool in color_pools:
                pool_ids[i.color_pool] = len(pools)
                pools.append([len(pool_bytes), len(color_pools[i.color_pool])])
                pool_bytes += color_pools[i.color_pool]
            inst.append(model_ids[i.model])
            inst.extend(i.matrix[r * 4 + c] for r in range(4) for c in range(3))
            inst.extend((pool_ids.get(i.color_pool, -1), i.color_offset))
        for key, arr in (('verts', verts), ('uvs', muvs), ('cols', cols), ('tris', tris), ('inst', inst)):
            pack.add(key, arr)
        pack.add('colorPools', pool_bytes)
        pack.meta = {'runs': runs, 'lightmaps': lightmaps, 'models': model_meta, 'pools': pools,
                     'instances': len(instances), 'patches': len(patches)}

        file = f'{name}.js'
        size = pack.write(os.path.join(data_dir, file), name)
        total_bytes += size

        # bounding sphere (viewer space) from patch boxes and object positions
        for p in patches:
            points += [to_viewer(p.bbox_min), to_viewer(p.bbox_max)]
        lo = [min(q[k] for q in points) for k in range(3)]
        hi = [max(q[k] for q in points) for k in range(3)]
        centre = [(a + b) / 2 for a, b in zip(lo, hi)]
        radius = max(((a - b) / 2) ** 2 for a, b in zip(lo, hi)) ** 0.5 * 3 ** 0.5
        locations.append({'name': name, 'title': COURSE_NAMES.get(name), 'what': describe(name),
                          'peak': peak(name), 'file': file, 'patches': len(patches),
                          'instances': len(instances), 'center': centre, 'radius': radius})
        print(f'  {name:<8} {len(patches):>5} patches {len(instances):>5} objects  {size / 1e6:5.2f} MB',
              file=sys.stderr)

    # shared textures, keyed by bank id
    tex_bytes, textures = bytearray(), {}
    for tid in sorted(t for t in used_textures if t >= 0):
        kind, w, h, pixels, palette = texture_payload(bank[tid])
        textures[tid] = [kind, w, h, len(tex_bytes), len(pixels), len(tex_bytes) + len(pixels),
                         len(palette) // 2, int(tid in EDITOR_TEXTURES or is_helper_texture(bank[tid]))]
        tex_bytes += pixels + palette
        tex_bytes += bytes(-len(tex_bytes) % 4)
    pack = Pack({'textures': textures})
    pack.add('bytes', tex_bytes)
    total_bytes += pack.write(os.path.join(data_dir, 'textures.js'), 'textures')

    # overview: every location's low-detail terrain, quantized across the whole mountain
    lo = [min(p[k] for p in overview_pos) for k in range(3)]
    hi = [max(p[k] for p in overview_pos) for k in range(3)]
    q = array('h', (round((p[k] - lo[k]) / (hi[k] - lo[k]) * 65535) - 32768 for p in overview_pos for k in range(3)))
    pack = Pack({'steps': OVERVIEW_STEPS, 'min': lo, 'max': hi, 'locations': locations})
    pack.add('pos', q)
    pack.add('col', overview_col)
    total_bytes += pack.write(os.path.join(data_dir, 'overview.js'), 'overview')

    shutil.copy(os.path.join(HERE, 'viewer_template.html'), os.path.join(args.out, 'index.html'))
    total_bytes += os.path.getsize(os.path.join(args.out, 'index.html'))
    print(f'Wrote {args.out}/ ({total_bytes / 1e6:.1f} MB in {len(locations) + 3} files)')


if __name__ == '__main__':
    main()
