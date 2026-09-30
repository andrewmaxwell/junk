#!/usr/bin/env python3
"""Export SSX 3 terrain and placed objects into a self-contained HTML 3D viewer.

    python3 export_viewer.py                 # -> out/terrain.html
    python3 export_viewer.py --steps 8       # smoother terrain (bigger file)
    python3 export_viewer.py --no-objects    # terrain only
"""
import argparse
import base64
import json
import os
import struct
import sys
from array import array

from list_geometry import DEFAULT_ISO, describe
from rvz import GCDisc
import gxtex
import ssx3

HERE = os.path.dirname(os.path.abspath(__file__))


def tessellate(patches, steps):
    """Grid points for every patch, (steps+1)^2 per patch, game Z-up -> Y-up."""
    n = steps + 1
    weights = []  # the 16 basis products u^i v^j for each grid point
    for a in range(n):
        for b in range(n):
            us = [(a / steps) ** i for i in range(4)]
            vs = [(b / steps) ** j for j in range(4)]
            weights.append([us[i] * vs[j] for i in range(4) for j in range(4)])
    out = []
    for p in patches:
        cx = [c[0] for c in p.coef]
        cy = [c[1] for c in p.coef]
        cz = [c[2] for c in p.coef]
        for w in weights:
            x = sum(a * b for a, b in zip(w, cx))
            y = sum(a * b for a, b in zip(w, cy))
            z = sum(a * b for a, b in zip(w, cz))
            out.append((x, z, -y))
    return out


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


def b64(arr):
    if sys.byteorder != 'little':
        arr.byteswap()
    return base64.b64encode(arr.tobytes()).decode()


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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image', nargs='?', default=DEFAULT_ISO)
    ap.add_argument('--steps', type=int, default=6, help='tessellation steps per patch edge (default 6)')
    ap.add_argument('--no-objects', action='store_true', help='leave out placed prefab models')
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'terrain.html'))
    args = ap.parse_args()

    disc = GCDisc(args.image)
    print('Decoding world...', file=sys.stderr)
    world = ssx3.World(disc.read_file('data/worlds/bam.big'))
    bank, lightmap_bank, color_pools = world.textures(), world.lightmaps(), world.color_pools()

    texture_ids = {}   # texture bank id -> index in the exported texture list
    lightmap_ids = {}  # lightmap id -> index in the exported lightmap list
    pool_ids = {}      # (track, rid) -> index in the exported colour pool list

    def index_in(table, bank_, key):
        if key not in bank_:
            return -1
        return table.setdefault(key, len(table))

    def tex_index(tid):
        return index_in(texture_ids, bank, tid)

    models = {} if args.no_objects else world.models()
    model_ids = {}  # (track, rid) -> index in the exported model list
    # per model: [panel flag, [texture index, vertex count, triangle count] per mesh]
    model_meta = []
    model_verts, model_uvs, model_cols, model_tris = array('f'), array('f'), array('H'), array('H')
    # per instance: model index, 12 matrix floats (3 columns x 4 rows), colour pool index, byte offset
    inst = array('f')
    patch_uvs, patch_lm = array('f'), array('f')

    locations, points = [], []
    for track in world.tracks():
        name = world.location_name(track)
        patches = sorted(world.patches(track), key=lambda p: (p.texture, p.lightmap))
        instances = [i for i in world.instances(track) if i.model in models]
        if not patches and not instances:
            continue
        for i in instances:
            if i.model not in model_ids:
                m = models[i.model]
                model_ids[i.model] = len(model_meta)
                meshes = []
                for mesh in m.meshes:
                    tid = m.textures[mesh.material] if mesh.material < len(m.textures) else None
                    meshes.append([tex_index(tid), len(mesh.verts), len(mesh.tris)])
                    model_verts.extend(c for v in mesh.verts for c in v)
                    model_uvs.extend(c for uv in mesh.uvs for c in uv)
                    model_cols.extend(mesh.colors)
                    model_tris.extend(k for t in mesh.tris for k in t)
                model_meta.append([int(is_panel(m)), meshes])
            inst.append(model_ids[i.model])
            inst.extend(i.matrix[r * 4 + c] for r in range(4) for c in range(3))
            inst.extend((index_in(pool_ids, color_pools, i.color_pool), i.color_offset))
        runs = []  # [texture index, lightmap index, patch count] in patch order
        for p in patches:
            t, lm = tex_index(p.texture), index_in(lightmap_ids, lightmap_bank, p.lightmap)
            if runs and runs[-1][:2] == [t, lm]:
                runs[-1][2] += 1
            else:
                runs.append([t, lm, 1])
            patch_uvs.extend(p.uv_corners)
            patch_lm.extend(p.lightmap_rect)
        print(f'  {name:<8} {len(patches):>5} patches {len(instances):>5} objects', file=sys.stderr)
        locations.append({'name': name, 'what': describe(name), 'patches': len(patches),
                          'instances': len(instances), 'runs': runs})
        points += tessellate(patches, args.steps)

    lo = [min(p[a] for p in points) for a in range(3)]
    hi = [max(p[a] for p in points) for a in range(3)]
    # quantize terrain to int16 across the bounding box (~5 game units of precision)
    q = array('h', (round((p[a] - lo[a]) / (hi[a] - lo[a]) * 65535) - 32768 for p in points for a in range(3)))

    tex_bytes = bytearray()

    def add_texture(tex, helper=False):
        kind, w, h, pixels, palette = texture_payload(tex)
        entry = [kind, w, h, len(tex_bytes), len(pixels), len(tex_bytes) + len(pixels), len(palette) // 2, int(helper)]
        tex_bytes.extend(pixels + palette)
        tex_bytes.extend(bytes(-len(tex_bytes) % 4))
        return entry

    # insertion order == index order
    textures = [add_texture(bank[tid], is_helper_texture(bank[tid])) for tid in texture_ids]
    lightmaps = [add_texture(lightmap_bank[lid]) for lid in lightmap_ids]
    pool_bytes, pools = bytearray(), []
    for key in pool_ids:
        pools.append([len(pool_bytes), len(color_pools[key])])
        pool_bytes += color_pools[key]

    meta = {'steps': args.steps, 'min': lo, 'max': hi, 'locations': locations, 'models': model_meta,
            'textures': textures, 'lightmaps': lightmaps, 'colorPools': pools}
    with open(os.path.join(HERE, 'viewer_template.html')) as f:
        html = f.read()
    for key, value in (('__META__', json.dumps(meta, separators=(',', ':'))), ('__TERRAIN__', b64(q)),
                       ('__PATCH_UVS__', b64(patch_uvs)), ('__PATCH_LM__', b64(patch_lm)),
                       ('__MODEL_VERTS__', b64(model_verts)), ('__MODEL_UVS__', b64(model_uvs)),
                       ('__MODEL_COLS__', b64(model_cols)), ('__MODEL_TRIS__', b64(model_tris)),
                       ('__COLOR_POOLS__', base64.b64encode(pool_bytes).decode()),
                       ('__INSTANCES__', b64(inst)), ('__TEXTURES__', base64.b64encode(tex_bytes).decode())):
        html = html.replace(key, value)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        f.write(html)
    terrain_tris = sum(l['patches'] for l in locations) * args.steps ** 2 * 2
    object_tris = sum(sum(m[2] for m in model_meta[int(inst[i])][1]) for i in range(0, len(inst), 15))
    print(f'Wrote {args.out} ({len(html) / 1e6:.1f} MB): {terrain_tris:,} terrain + '
          f'{object_tris:,} object triangles, {len(textures)} textures + {len(lightmaps)} lightmaps ({len(tex_bytes) / 1e6:.1f} MB)')


if __name__ == '__main__':
    main()
