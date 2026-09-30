#!/usr/bin/env python3
"""List the level geometry available in an SSX 3 GameCube disc image (.rvz).

    python3 list_geometry.py                       # summary of every location
    python3 list_geometry.py --export ABC1         # terrain patches of ABC1 -> ABC1.obj
    python3 list_geometry.py --export ALL          # the whole mountain -> ALL.obj
"""
import argparse
import os
import sys
import time

from rvz import GCDisc
import ssx3

DEFAULT_ISO = os.path.expanduser('~/Downloads/SSX 3 (USA)/SSX 3 (USA).rvz')

# Location codes: letter = peak, then event type and number.
EVENTS = {'BA': 'Big Air', 'RA': 'Race', 'SS': 'Slopestyle', 'HP': 'Superpipe',
          'BC': 'Backcountry', 'SKY': 'skybox'}


def describe(name):
    if name == 'TRANSP':
        return 'transparent/shared'
    if len(name) == 1:
        return f'peak {name} hub'
    if '_' in name:
        return 'connector'
    for code, label in EVENTS.items():
        if name[1:].startswith(code):
            return f'peak {name[0]} {label}'
    return ''


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('image', nargs='?', default=DEFAULT_ISO)
    ap.add_argument('--export', metavar='LOCATION', help='write terrain of LOCATION (or ALL) to an OBJ')
    ap.add_argument('--steps', type=int, default=8, help='tessellation steps per patch edge (default 8)')
    ap.add_argument('--out', default='.', help='output directory for exports')
    args = ap.parse_args()

    t0 = time.time()
    disc = GCDisc(args.image)
    print(f'{disc.game_id}  {disc.title}  ({len(disc.files)} files on disc)')
    worlds = [p for p in disc.files if p.startswith('data/worlds/') and p.endswith('.big')]
    print('World archives:', ', '.join(worlds))

    for path in worlds:
        print(f'\nLoading {path} ({disc.files[path][1] / 1e6:.0f} MB)...', file=sys.stderr)
        world = ssx3.World(disc.read_file(path))
        print(f'Decoded in {time.time() - t0:.1f}s\n', file=sys.stderr)

        if args.export:
            export(world, args)
            continue

        header = (f'{"trk":>3}  {"location":<8} {"what":<22} {"patches":>7} {"coll tris":>9} '
                  f'{"prefabs":>7} {"instances":>9} {"splines":>7}  terrain size (game units)')
        print(header)
        print('-' * len(header))
        totals = [0] * 5
        for track in world.tracks():
            name = world.location_name(track)
            counts = [len(world.chunks[track, 1]), world.collision_triangles(track),
                      len(world.chunks[track, 2]), len(world.chunks[track, 3]), len(world.chunks[track, 8])]
            if not any(counts):
                continue
            totals = [a + b for a, b in zip(totals, counts)]
            size = ''
            if counts[0]:
                lo, hi = bbox(world.patches(track))
                size = ' x '.join(f'{h - l:,.0f}' for l, h in zip(lo, hi))
            print(f'{track:>3}  {name:<8} {describe(name):<22} {counts[0]:>7} {counts[1]:>9} '
                  f'{counts[2]:>7} {counts[3]:>9} {counts[4]:>7}  {size}')
        print('-' * len(header))
        print(f'{"":>3}  {"TOTAL":<8} {"":<22} {totals[0]:>7} {totals[1]:>9} {totals[2]:>7} '
              f'{totals[3]:>9} {totals[4]:>7}')

        other = sorted({t for (_, t) in world.chunks} - {1, 2, 3, 8, 12})
        print('\nOther chunk types present:',
              ', '.join(ssx3.CHUNK_TYPES.get(t, f'type {t}') for t in other))
        print('\nExport: terrain patches to OBJ with --export; terrain plus every placed\n'
              'object to a 3D viewer with export_viewer.py.')


def bbox(patches):
    lo = [min(p.bbox_min[a] for p in patches) for a in range(3)]
    hi = [max(p.bbox_max[a] for p in patches) for a in range(3)]
    return lo, hi


def export(world, args):
    want = args.export.upper()
    tracks = [t for t in world.tracks() if want == 'ALL' or world.location_name(t).upper() == want]
    patches = [p for t in tracks for p in world.patches(t)]
    if not patches:
        names = sorted({world.location_name(t) for t in world.tracks() if world.chunks[t, 1]})
        sys.exit(f'No terrain patches for {args.export!r}. Locations with terrain: {", ".join(names)}')
    os.makedirs(args.out, exist_ok=True)
    path = os.path.join(args.out, f'{args.export}.obj')
    ssx3.write_patches_obj(patches, path, steps=args.steps)
    tris = len(patches) * args.steps ** 2 * 2
    print(f'Wrote {len(patches)} patches ({tris:,} triangles) to {path}')


if __name__ == '__main__':
    main()
