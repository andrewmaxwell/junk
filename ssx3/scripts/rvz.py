"""Minimal read-only RVZ (Dolphin compressed disc image) reader for GameCube discs.

Format reference: Dolphin's docs/WiaAndRvz.md. Only what's needed to read
GameCube file data: zstd/none compression, raw data entries, RVZ packing
(junk regions are returned as zeros since they're never inside real files).
"""
import struct
from compression import zstd


class RVZ:
    def __init__(self, path):
        self.f = open(path, 'rb')
        h1 = self.f.read(0x48)
        magic, _ver, _compat, h2_size = struct.unpack('>4sIII', h1[:16])
        if magic != b'RVZ\x01':
            raise ValueError(f'not an RVZ file (magic {magic!r})')
        self.iso_size = struct.unpack('>Q', h1[0x24:0x2C])[0]
        h2 = self.f.read(h2_size)
        (self.disc_type, self.compression, _level, self.chunk_size) = struct.unpack('>IIiI', h2[:16])
        self.disc_header = h2[16:16 + 0x80]
        o = 16 + 0x80
        n_parts, _part_size, _part_off = struct.unpack('>IIQ', h2[o:o + 16])
        o += 16 + 20
        n_raw, raw_off, raw_size, n_grp, grp_off, grp_size = struct.unpack('>IQIIQI', h2[o:o + 32])
        if self.disc_type != 1:
            raise ValueError('only GameCube discs are supported')
        if self.compression not in (0, 5):
            raise ValueError(f'unsupported compression type {self.compression} (need none or zstd)')

        raw = self._decompress_meta(raw_off, raw_size)
        self.raw_entries = [struct.unpack_from('>QQII', raw, i * 24) for i in range(n_raw)]
        grp = self._decompress_meta(grp_off, grp_size)
        self.groups = [struct.unpack_from('>III', grp, i * 12) for i in range(n_grp)]
        self._cache = {}

    def _decompress_meta(self, off, size):
        self.f.seek(off)
        data = self.f.read(size)
        return zstd.decompress(data) if self.compression == 5 else data

    def _group(self, index, expected_size):
        if index in self._cache:
            return self._cache[index]
        data_off, data_size, packed_size = self.groups[index]
        compressed = bool(data_size & 0x80000000)
        data_size &= 0x7FFFFFFF
        if data_size == 0:
            out = bytes(expected_size)
        else:
            self.f.seek(data_off * 4)
            out = self.f.read(data_size)
            if compressed:
                out = zstd.decompress(out)
            if packed_size:
                out = self._unpack(out)
        if len(self._cache) > 64:
            self._cache.clear()
        self._cache[index] = out
        return out

    @staticmethod
    def _unpack(data):
        out = bytearray()
        i = 0
        while i < len(data):
            size = struct.unpack_from('>I', data, i)[0]
            i += 4
            if size & 0x80000000:
                size &= 0x7FFFFFFF
                i += 68  # junk-data PRNG seed; junk only fills gaps between files
                out += bytes(size)
            else:
                out += data[i:i + size]
                i += size
        return bytes(out)

    def read(self, offset, size):
        out = bytearray()
        end = offset + size
        if offset < 0x80:
            out += self.disc_header[offset:min(end, 0x80)]
            offset = min(end, 0x80)
        while offset < end:
            for data_off, data_size, grp_index, n_groups in self.raw_entries:
                start = data_off - data_off % 0x8000
                stop = data_off + data_size
                if start <= offset < stop:
                    g = (offset - start) // self.chunk_size
                    g_start = start + g * self.chunk_size
                    g_len = min(self.chunk_size, stop - g_start)
                    chunk = self._group(grp_index + g, g_len)
                    take = min(end, g_start + g_len) - offset
                    out += chunk[offset - g_start:offset - g_start + take]
                    offset += take
                    break
            else:
                raise ValueError(f'offset {offset:#x} not covered by any raw data entry')
        return bytes(out)


class GCDisc:
    """GameCube filesystem (FST) on top of an RVZ image."""

    def __init__(self, path):
        self.img = RVZ(path)
        hdr = self.img.read(0, 0x440)
        self.game_id = hdr[:6].decode()
        self.title = hdr[0x20:0x60].split(b'\0')[0].decode(errors='replace')
        fst_off, fst_size = struct.unpack('>II', hdr[0x424:0x42C])
        fst = self.img.read(fst_off, fst_size)
        n = struct.unpack_from('>I', fst, 8)[0]
        strings = fst[n * 12:]
        self.files = {}  # path -> (disc offset, size)

        def name_at(i):
            off = struct.unpack_from('>I', fst, i * 12)[0] & 0xFFFFFF
            return strings[off:strings.index(b'\0', off)].decode('shift_jis', errors='replace')

        def walk(start, end, prefix):
            i = start
            while i < end:
                word0, a, b = struct.unpack_from('>III', fst, i * 12)
                name = name_at(i)
                if word0 >> 24:  # directory: b = index of next entry after this dir
                    walk(i + 1, b, prefix + name + '/')
                    i = b
                else:
                    self.files[prefix + name] = (a, b)
                    i += 1
        walk(1, n, '')

    def read_file(self, path, offset=0, size=None):
        off, length = self.files[path]
        if size is None:
            size = length - offset
        return self.img.read(off + offset, min(size, length - offset))
