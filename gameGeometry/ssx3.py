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
        return [Patch(d) for _, d in self.chunks[track, 1]]

    def collision_triangles(self, track):
        return sum(sum(ic for ic, _, _ in collision_meshes(d, False)) for _, d in self.chunks[track, 12])


class Patch:
    """Bicubic terrain patch. The 16 stored points are power-basis coefficients
    (stored highest order first), so S(u,v) = sum C[i][j] u^i v^j."""

    def __init__(self, d):
        stored = [struct.unpack_from('>3f', d, 0x40 + 16 * m) for m in range(16)]
        self.coef = stored[::-1]
        self.bbox_min = struct.unpack_from('>3f', d, 0x180)
        self.bbox_max = struct.unpack_from('>3f', d, 0x18C)

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
