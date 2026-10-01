"""EA RefPack (a.k.a. QFS / 0x10FB) decompressor."""


def decompress(src, pos=0):
    b0 = src[pos]
    if src[pos + 1] != 0xFB:
        raise ValueError('not RefPack data')
    size_bytes = 4 if b0 & 0x80 else 3
    pos += 2
    if b0 & 0x01:  # compressed size present
        pos += size_bytes
    out_size = int.from_bytes(src[pos:pos + size_bytes], 'big')
    pos += size_bytes
    out = bytearray()
    while True:
        c = src[pos]
        if c < 0x80:
            c1 = src[pos + 1]; pos += 2
            lit = c & 3; length = ((c >> 2) & 7) + 3; off = ((c & 0x60) << 3) + c1 + 1
        elif c < 0xC0:
            c1, c2 = src[pos + 1], src[pos + 2]; pos += 3
            lit = c1 >> 6; length = (c & 0x3F) + 4; off = ((c1 & 0x3F) << 8) + c2 + 1
        elif c < 0xE0:
            c1, c2, c3 = src[pos + 1], src[pos + 2], src[pos + 3]; pos += 4
            lit = c & 3; length = ((c & 0x0C) << 6) + c3 + 5; off = ((c & 0x10) << 12) + (c1 << 8) + c2 + 1
        elif c < 0xFC:
            lit = ((c & 0x1F) + 1) * 4
            out += src[pos + 1:pos + 1 + lit]; pos += 1 + lit
            continue
        else:
            lit = c & 3
            out += src[pos + 1:pos + 1 + lit]
            break
        out += src[pos:pos + lit]; pos += lit
        start = len(out) - off
        if off >= length:
            out += out[start:start + length]
        else:  # overlapping copy
            for k in range(length):
                out.append(out[start + k])
    if len(out) != out_size:
        raise ValueError(f'RefPack size mismatch {len(out)} != {out_size}')
    return bytes(out)
