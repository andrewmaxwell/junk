#!/usr/bin/env python3
"""Export all SSX 3 terrain into a self-contained HTML 3D viewer.

    python3 export_viewer.py                 # -> out/terrain.html
    python3 export_viewer.py --steps 8       # smoother (bigger file)
"""
import argparse
import base64
import json
import os
import struct
import sys

from list_geometry import DEFAULT_ISO, describe
from rvz import GCDisc
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


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image', nargs='?', default=DEFAULT_ISO)
    ap.add_argument('--steps', type=int, default=6, help='tessellation steps per patch edge (default 6)')
    ap.add_argument('--out', default=os.path.join(HERE, 'out', 'terrain.html'))
    args = ap.parse_args()

    disc = GCDisc(args.image)
    print('Decoding world...', file=sys.stderr)
    world = ssx3.World(disc.read_file('data/worlds/bam.big'))

    locations, points = [], []
    for track in world.tracks():
        patches = world.patches(track)
        if not patches:
            continue
        name = world.location_name(track)
        print(f'  {name:<8} {len(patches):>5} patches', file=sys.stderr)
        locations.append({'name': name, 'what': describe(name), 'patches': len(patches)})
        points += tessellate(patches, args.steps)

    lo = [min(p[a] for p in points) for a in range(3)]
    hi = [max(p[a] for p in points) for a in range(3)]
    # quantize to int16 across the bounding box (~5 game units of precision)
    q = bytearray()
    for p in points:
        q += struct.pack('<3h', *(round((p[a] - lo[a]) / (hi[a] - lo[a]) * 65535) - 32768 for a in range(3)))

    meta = {'steps': args.steps, 'min': lo, 'max': hi, 'locations': locations}
    with open(os.path.join(HERE, 'viewer_template.html')) as f:
        html = f.read()
    html = html.replace('__META__', json.dumps(meta)).replace('__DATA__', base64.b64encode(q).decode())
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w') as f:
        f.write(html)
    tris = sum(l['patches'] for l in locations) * args.steps ** 2 * 2
    print(f'Wrote {args.out} ({len(html) / 1e6:.1f} MB, {tris:,} triangles)')


if __name__ == '__main__':
    main()
