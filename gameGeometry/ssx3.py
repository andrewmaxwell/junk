"""Parser for SSX 3 (GameCube) world data: data/worlds/*.big -> .gdb/.gsb.

Layout (worked out from the disc, guided by GlitcherOG's PS2 SSX 3 research in
github.com/GlitcherOG/SSX-Library; the GameCube files are big-endian):

  X.big   EA "BIGF" archive holding X.gdb, X.gsb, X.ghm, X.gsm
  X.gdb   world database: table of named locations (courses, hubs, skies)
  X.gsb   world stream: 0x8000-aligned blocks, each "CBXS"/"CEND" + u32 +
          RefPack data. Decompressed blocks concatenate into a section; a
          "CEND" block ends the section. A section is a run of chunks with
          8-byte headers: u8 type, u24 size, u8 track (= location index,
          255 = shared), u24 resource id.
"""
import struct
from collections import defaultdict

import refpack

CHUNK_TYPES = {
    0: 'materials', 1: 'patches', 2: 'prefab models', 3: 'instances',
    4: 'particle models', 5: 'particle instances', 6: 'lights', 7: 'halos',
    8: 'splines', 9: 'textures', 10: 'lightmaps', 11: 'vis curtains',
    12: 'collision meshes', 13: 'sound triggers', 14: 'AI paths',
    15: 'world painter', 16: 'scripts', 17: 'camera triggers', 18: 'NIS table',
    19: 'missions', 20: 'audio banks', 21: 'radar', 22: 'avalanche anim',
}


def read_big(data):
    """EA BIGF archive -> {name: bytes}. Offsets/sizes are big-endian."""
    if data[:4] != b'BIGF':
        raise ValueError('not a BIGF archive')
    count = struct.unpack_from('>I', data, 8)[0]
    out, o = {}, 16
    for _ in range(count):
        off, size = struct.unpack_from('>II', data, o)
        end = data.index(b'\0', o + 8)
        out[data[o + 8:end].decode()] = data[off:off + size]
        o = end + 1
    return out


def read_locations(gdb):
    n = struct.unpack_from('>I', gdb, 8)[0]
    return [gdb[0x50 + 88 * i:0x50 + 88 * i + 16].split(b'\0')[0].decode() for i in range(n)]


def read_sections(gsb):
    """Yield the decompressed bytes of each CEND-terminated section."""
    cur = bytearray()
    for p in range(0, len(gsb), 0x8000):
        magic = gsb[p:p + 4]
        if magic not in (b'CBXS', b'CEND'):
            continue  # continuation of a block longer than 0x8000
        cur += refpack.decompress(gsb, p + 8)
        if magic == b'CEND':
            yield bytes(cur)
            cur = bytearray()


def read_chunks(section):
    """Yield (type, track, rid, data) for each chunk in a section."""
    p = 0
    while p + 8 <= len(section):
        ctype = section[p]
        size = int.from_bytes(section[p + 1:p + 4], 'big')
        track = section[p + 4]
        rid = int.from_bytes(section[p + 5:p + 8], 'big')
        yield ctype, track, rid, section[p + 8:p + 8 + size]
        p += 8 + size


class World:
    def __init__(self, big_bytes):
        files = read_big(big_bytes)
        by_ext = {name.rsplit('.', 1)[-1]: data for name, data in files.items()}
        self.locations = read_locations(by_ext['gdb'])
        self.chunks = defaultdict(list)  # (track, type) -> [(rid, data)]
        for section in read_sections(by_ext['gsb']):
            for ctype, track, rid, data in read_chunks(section):
                self.chunks[track, ctype].append((rid, data))

    def location_name(self, track):
        if track == 255:
            return '(shared)'
        return self.locations[track] if track < len(self.locations) else f'track{track}'

    def tracks(self):
        return sorted({t for t, _ in self.chunks})

    def patches(self, track):
        return [Patch(d, rid) for rid, d in self.chunks[track, 1]]

    def collision_triangles(self, track):
        return sum(sum(ic for ic, _, _ in collision_meshes(d, False)) for _, d in self.chunks[track, 12])

    def _chunk(self, ctype, ref):
        """Look up a chunk by a packed (u8 track, u24 rid) reference."""
        track, rid = ref >> 24, ref & 0xFFFFFF
        return next((d for r, d in self.chunks[track, ctype] if r == rid), None)

    def models(self):
        """{(track, rid): Model} for every prefab model in the world.

        A model's header word at 0x18 references a vertex-buffer descriptor
        (chunk type 23: position pool, UV pool, colour pool references). Big
        locations split their positions across several type-25 pools."""
        out = {}
        for (track, ctype), items in list(self.chunks.items()):
            if ctype != 2:
                continue
            for rid, d in items:
                desc = self._chunk(23, struct.unpack_from('>I', d, 0x18)[0])
                if not desc:
                    continue
                pos_ref, uv_ref = struct.unpack_from('>II', desc, 0)
                pool, uvs = self._chunk(25, pos_ref), self._chunk(27, uv_ref)
                if pool and uvs:
                    model = Model(d, pool, uvs)
                    model.textures = [self.texture_id(ref) for ref in model.materials]
                    out[track, rid] = model
        return out

    def texture_id(self, material_ref):
        """Material (chunk type 0) -> id in the shared texture bank, or None."""
        mat = self._chunk(0, material_ref)
        return struct.unpack_from('>H', mat, 0)[0] if mat else None

    def lightmaps(self):
        """{lightmap id: texture chunk} (chunk type 10, CMPR, shared bank on track 255)."""
        out = {}
        for rid, d in self.chunks[255, 10]:
            out.setdefault(rid, d)
        return out

    def color_pools(self):
        """{(track, rid): bytes} of RGB565 vertex colours (chunk type 24), baked lighting for objects."""
        return {(track, rid): d for (track, ctype), items in self.chunks.items() if ctype == 24 for rid, d in items}

    def textures(self):
        """{texture id: texture chunk}. The bank lives on track 255 and is
        re-streamed with every section, so ids repeat; keep the first copy."""
        out = {}
        for rid, d in self.chunks[255, 9]:
            out.setdefault(rid, d)
        return out

    def instances(self, track):
        return [Instance(d, rid) for rid, d in self.chunks[track, 3]]


IDENTITY = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)


def mat_mul(a, b):
    """Row-vector convention (v' = v·M), so a·b applies a first."""
    return tuple(sum(a[r * 4 + i] * b[i * 4 + c] for i in range(4)) for r in range(4) for c in range(4))


def transform(p, m):
    x, y, z = p
    return (x * m[0] + y * m[4] + z * m[8] + m[12],
            x * m[1] + y * m[5] + z * m[9] + m[13],
            x * m[2] + y * m[6] + z * m[10] + m[14])


class Instance:
    """A placed copy of a prefab model (160-byte chunk)."""

    def __init__(self, d, rid=None):
        self.rid = rid
        self.matrix = struct.unpack_from('>16f', d, 0x08)
        self.model = (d[0x78], int.from_bytes(d[0x79:0x7C], 'big'))
        # baked lighting: this placement's colours start at a byte offset in a colour pool
        ref, self.color_offset = struct.unpack_from('>II', d, 0x98)
        self.color_pool = (ref >> 24, ref & 0xFFFFFF)


class Mesh:
    def __init__(self, material):
        self.material = material  # index into Model.materials
        self.verts, self.uvs, self.colors, self.tris = [], [], [], []  # colors: per-placement colour index


class Model:
    """Prefab model (chunk type 2). Header: u32 id, u32 part count, u32 part
    table offset, ..., u32 display-list base at 0x1C, u32 material count at
    0x20 followed by material references. Each 16-byte part entry is (parent
    index, part info offset, extra, matrix offset). Part info: bbox (24 bytes),
    u32, u32 mesh count, u32 offset of mesh-record pointers; a mesh record is
    (u16 material index, u16, u32 display-list offset, u32 display-list size).

    Display lists are GameCube GX primitives with 7-byte vertices:
    u16 position index, u8 normal index, u16 colour index, u16 UV index.
    The colour index is relative to each placement's block in a colour pool.
    Positions come from a type-25 pool (s16, scaled by 1/4) and UVs from a
    type-27 pool (s16 pairs, scaled by 1/4096)."""

    def __init__(self, d, pool, uv_pool):
        self.meshes = []
        self.textures = []  # texture id per material, filled in by World
        nparts, table = struct.unpack_from('>II', d, 4)
        dl_base, nmat = struct.unpack_from('>II', d, 0x1C)
        self.materials = list(struct.unpack_from(f'>{nmat}I', d, 0x24))
        part_mats = []
        for k in range(nparts):
            parent, info, _, moff = struct.unpack_from('>iIII', d, table + 16 * k)
            m = struct.unpack_from('>16f', d, moff) if moff != 0xFFFFFFFF else IDENTITY
            if parent >= 0:
                m = mat_mul(m, part_mats[parent])
            part_mats.append(m)
            if info == 0:  # a transform-only node
                continue
            nmesh, ptrs = struct.unpack_from('>II', d, info + 28)
            for j in range(nmesh):
                rec = struct.unpack_from('>I', d, ptrs + 4 * j)[0]
                material, _, dl_off, dl_size = struct.unpack_from('>HHII', d, rec)
                mesh = Mesh(material)
                self._read_display_list(d, dl_base + dl_off, dl_base + dl_off + dl_size, pool, uv_pool, m, mesh)
                if mesh.tris:
                    self.meshes.append(mesh)

    @property
    def verts(self):
        return [v for mesh in self.meshes for v in mesh.verts]

    @property
    def tris(self):
        out, base = [], 0
        for mesh in self.meshes:
            out += [(a + base, b + base, c + base) for a, b, c in mesh.tris]
            base += len(mesh.verts)
        return out

    @staticmethod
    def _read_display_list(d, p, end, pool, uv_pool, m, mesh):
        lookup = {}
        while p + 3 <= end and (d[p] & 0xF8) in (0x80, 0x90, 0x98, 0xA0):
            op = d[p] & 0xF8
            n = int.from_bytes(d[p + 1:p + 3], 'big')
            p += 3
            idx = []
            for _ in range(n):
                pi, _normal, ci, ti = struct.unpack_from('>HBHH', d, p)
                p += 7
                if (pi, ci, ti) not in lookup:
                    v = tuple(c / 4 for c in struct.unpack_from('>3h', pool, 6 * pi))
                    lookup[pi, ci, ti] = len(mesh.verts)
                    mesh.verts.append(transform(v, m) if m is not IDENTITY else v)
                    mesh.uvs.append(tuple(c / 4096 for c in struct.unpack_from('>2h', uv_pool, 4 * ti)))
                    mesh.colors.append(ci)
                idx.append(lookup[pi, ci, ti])
            if op == 0x90:    # triangles
                tris = [idx[i:i + 3] for i in range(0, n - 2, 3)]
            elif op == 0x98:  # triangle strip, alternating winding
                tris = [(idx[i], idx[i + 1], idx[i + 2]) if i % 2 == 0 else (idx[i + 1], idx[i], idx[i + 2])
                        for i in range(n - 2)]
            elif op == 0xA0:  # fan
                tris = [(idx[0], idx[i], idx[i + 1]) for i in range(1, n - 1)]
            else:             # quads
                tris = [t for i in range(0, n - 3, 4)
                        for t in ((idx[i], idx[i + 1], idx[i + 2]), (idx[i], idx[i + 2], idx[i + 3]))]
            mesh.tris += [tuple(t) for t in tris if len(set(t)) == 3]


class Patch:
    """Bicubic terrain patch. The 16 stored points are power-basis coefficients
    (stored highest order first), so S(u,v) = sum C[i][j] u^i v^j."""

    def __init__(self, d, rid=None):
        self.rid = rid
        stored = [struct.unpack_from('>3f', d, 0x40 + 16 * m) for m in range(16)]
        self.coef = stored[::-1]
        self.bbox_min = struct.unpack_from('>3f', d, 0x180)
        self.bbox_max = struct.unpack_from('>3f', d, 0x18C)
        # texture coordinates at the corners S(0,0), S(1,0), S(0,1), S(1,1)
        self.uv_corners = struct.unpack_from('>8f', d, 0x20)
        self.texture, self.lightmap = struct.unpack_from('>HH', d, 0x1A0)
        # where this patch sits in its lightmap: (u, v, width, height)
        self.lightmap_rect = struct.unpack_from('>4f', d, 0x10)

    def eval(self, u, v):
        us = (1, u, u * u, u * u * u)
        vs = (1, v, v * v, v * v * v)
        x = y = z = 0.0
        for i in range(4):
            for j in range(4):
                w = us[i] * vs[j]
                c = self.coef[i * 4 + j]
                x += c[0] * w; y += c[1] * w; z += c[2] * w
        return x, y, z


def collision_meshes(d, with_geometry=True):
    """Yield (triangle count, vertices, triangles) from a collision chunk.
    Meshes whose offsets fall outside the chunk (seen once on disc) are skipped."""
    kind, count, models_off = struct.unpack_from('>hhi', d, 0)
    if kind != 1:
        return
    for i in range(count):
        base = models_off + 20 * i
        if base + 20 > len(d):
            return
        ic, vc, io, _bbox, vo, _normals = struct.unpack_from('>hhiiii', d, base)
        if not (0 <= base + io and base + io + 3 * ic <= len(d) and 0 <= base + vo and base + vo + 16 * vc <= len(d)):
            continue
        if not with_geometry:
            yield ic, None, None
            continue
        verts = [struct.unpack_from('>3f', d, base + vo + 16 * k) for k in range(vc)]
        tris = [tuple(d[base + io + 3 * k:base + io + 3 * k + 3]) for k in range(ic)]
        yield ic, verts, tris


def write_patches_obj(patches, path, steps=8, scale=1.0):
    """Tessellate patches into an OBJ. Vertices are not welded between patches."""
    with open(path, 'w') as f:
        f.write('# SSX 3 terrain patches\n')
        base = 1
        for patch in patches:
            for a in range(steps + 1):
                for b in range(steps + 1):
                    x, y, z = patch.eval(a / steps, b / steps)
                    # game is Z-up; OBJ convention is Y-up
                    f.write(f'v {x * scale:.4f} {z * scale:.4f} {-y * scale:.4f}\n')
            for a in range(steps):
                for b in range(steps):
                    i = base + a * (steps + 1) + b
                    j = i + steps + 1
                    f.write(f'f {i} {j} {j + 1}\nf {i} {j + 1} {i + 1}\n')
            base += (steps + 1) ** 2
