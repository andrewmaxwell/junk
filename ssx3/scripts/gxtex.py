"""GameCube texture decoding for SSX 3 world textures (chunk type 9).

Each texture is an EA shape record: u8 type, u24 offset of the next block,
u16 width, u16 height, ... with pixels at +0x20. Two types are used:
  0x1E  CMPR (GameCube DXT1: 8x8 tiles of four 4x4 blocks)
  0x19  C8 (8-bit indices, 8x4 tiles) followed by a 0x32 palette block
Only the top mip level is decoded. Output is RGBA bytes, row-major.
"""
import struct
import zlib


def rgb565(c):
    r, g, b = c >> 11, (c >> 5) & 63, c & 31
    return (r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2, 255)


def rgb5a3(c):
    if c & 0x8000:
        r, g, b = (c >> 10) & 31, (c >> 5) & 31, c & 31
        return (r << 3 | r >> 2, g << 3 | g >> 2, b << 3 | b >> 2, 255)
    a, r, g, b = (c >> 12) & 7, (c >> 8) & 15, (c >> 4) & 15, c & 15
    return (r * 17, g * 17, b * 17, a * 255 // 7)


def ia8(c):
    a, i = c >> 8, c & 255
    return (i, i, i, a)


PALETTE_FORMATS = {'rgb5a3': rgb5a3, 'rgb565': rgb565, 'ia8': ia8}


def level_offset(d, level):
    """Byte offset and size of a mip level (level 0 is full size)."""
    kind = d[0]
    w, h = struct.unpack_from('>HH', d, 4)
    p = 0x20
    for _ in range(level):
        p += max(w, 8) * max(h, 8) // 2 if kind == 0x1E else max(w, 8) * max(h, 4)
        w, h = max(w // 2, 1), max(h // 2, 1)
    return p, w, h


def decode(d, palette_format='rgb5a3', level=0):
    """-> (width, height, rgba bytes)"""
    kind = d[0]
    p, w, h = level_offset(d, level)
    out = bytearray(w * h * 4)
    if kind == 0x1E:
        for ty in range(0, h, 8):
            for tx in range(0, w, 8):
                for sub in range(4):
                    bx, by = tx + (sub & 1) * 4, ty + (sub >> 1) * 4
                    c0, c1, bits = struct.unpack_from('>HHI', d, p)
                    p += 8
                    a, b = rgb565(c0), rgb565(c1)
                    if c0 > c1:
                        pal = [a, b, tuple((2 * x + y) // 3 for x, y in zip(a, b)),
                               tuple((x + 2 * y) // 3 for x, y in zip(a, b))]
                    else:
                        pal = [a, b, tuple((x + y) // 2 for x, y in zip(a, b)), (0, 0, 0, 0)]
                    for i in range(16):
                        x, y = bx + (i & 3), by + (i >> 2)
                        if x < w and y < h:
                            o = (y * w + x) * 4
                            out[o:o + 4] = bytes(pal[(bits >> (30 - 2 * i)) & 3])
    elif kind == 0x19:
        nxt = int.from_bytes(d[1:4], 'big')
        count = struct.unpack_from('>H', d, nxt + 4)[0]
        conv = PALETTE_FORMATS[palette_format]
        pal = [conv(struct.unpack_from('>H', d, nxt + 0x20 + 2 * i)[0]) for i in range(count)]
        pal += [(255, 0, 255, 255)] * (256 - len(pal))
        for ty in range(0, h, 4):
            for tx in range(0, w, 8):
                for i in range(32):
                    x, y = tx + (i & 7), ty + (i >> 3)
                    if x < w and y < h:
                        o = (y * w + x) * 4
                        out[o:o + 4] = bytes(pal[d[p]])
                    p += 1
    else:
        raise ValueError(f'unknown texture type {kind:#x}')
    return w, h, bytes(out)


def average(d):
    """Mean RGBA of a texture, from a small mip level."""
    # pixels end where the palette starts (C8) or at the end of the chunk (CMPR)
    end = int.from_bytes(d[1:4], 'big') if d[0] == 0x19 else len(d)
    level = 0
    while True:  # smallest stored mip level no bigger than 16x16
        p, w, h = level_offset(d, level)
        nxt, nw, nh = level_offset(d, level + 1)
        if max(w, h) <= 16 or nw * nh == w * h or level_offset(d, level + 2)[0] > end:
            break
        level += 1
    lw, lh, px = decode(d, level=level)
    n = lw * lh
    return tuple(sum(px[i::4]) // n for i in range(4))


def cmpr_pixel(d, x, y):
    """One RGBA pixel of a CMPR texture's full-size level, decoding only its block."""
    w, _ = struct.unpack_from('>HH', d, 4)
    tile = (y // 8) * (w // 8) + x // 8
    sub = ((y % 8) // 4) * 2 + (x % 8) // 4
    p = 0x20 + tile * 32 + sub * 8
    c0, c1, bits = struct.unpack_from('>HHI', d, p)
    a, b = rgb565(c0), rgb565(c1)
    i = (bits >> (30 - 2 * ((y % 4) * 4 + x % 4))) & 3
    if i < 2:
        return (a, b)[i]
    if c0 > c1:
        return tuple((2 * p + q) // 3 for p, q in zip(a, b)) if i == 2 else tuple((p + 2 * q) // 3 for p, q in zip(a, b))
    return tuple((p + q) // 2 for p, q in zip(a, b)) if i == 2 else (0, 0, 0, 0)


# Re-encoding for the viewer: the same images in the layouts browsers and GPUs expect, so the
# page never handles GameCube data.

# CMPR keeps a block's first pixel in the top two bits of each row byte; BC1 keeps it in the bottom two
_REVERSE_PAIRS = bytes((b & 3) << 6 | (b >> 2 & 3) << 4 | (b >> 4 & 3) << 2 | b >> 6 for b in range(256))


def to_bc1(d):
    """CMPR top level -> (w, h, BC1 blocks): standard DXT1, blocks row by row, little-endian colours."""
    w, h = struct.unpack_from('>HH', d, 4)
    tiles_across = (w + 7) // 8
    blocks = []
    for by in range((h + 3) // 4):
        for bx in range((w + 3) // 4):
            # an 8x8 tile holds four blocks: top left, top right, bottom left, bottom right
            i = 0x20 + ((by // 2 * tiles_across + bx // 2) * 4 + by % 2 * 2 + bx % 2) * 8
            blocks.append(d[i:i + 8])
    out = bytearray(b''.join(blocks))
    out[0::8], out[1::8] = out[1::8], out[0::8]
    out[2::8], out[3::8] = out[3::8], out[2::8]
    for k in range(4, 8):
        out[k::8] = out[k::8].translate(_REVERSE_PAIRS)
    return w, h, bytes(out)


def to_indexed(d):
    """C8 top level -> (w, h, row-major 8-bit indices, RGBA8 palette)."""
    w, h = struct.unpack_from('>HH', d, 4)
    nxt = int.from_bytes(d[1:4], 'big')
    count = struct.unpack_from('>H', d, nxt + 4)[0]
    tiles_across = (w + 7) // 8
    rows = []
    for y in range(h):  # tiles are 8x4
        base = 0x20 + (y // 4 * tiles_across * 4 + y % 4) * 8
        rows.append(b''.join(d[base + 32 * tx:base + 32 * tx + 8] for tx in range(tiles_across))[:w])
    palette = b''.join(bytes(rgb5a3(c)) for c in struct.unpack_from(f'>{count}H', d, nxt + 0x20))
    return w, h, b''.join(rows), palette


_RGB565_TO_RGB8 = [bytes(rgb565(c)[:3]) for c in range(65536)]


def rgb8_colors(d):
    """Big-endian RGB565 colours -> RGB8 bytes."""
    return b''.join(_RGB565_TO_RGB8[c] for c in struct.unpack(f'>{len(d) // 2}H', d))


def png(w, h, rgba):
    rows = b''.join(b'\0' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b''))
