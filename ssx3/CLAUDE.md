# ssx3

Extracts and views the level geometry of **SSX 3 (GameCube, USA, GXBE69)** from the
user's own disc image. Pure Python 3.14 (stdlib only: `compression.zstd`, `gzip`,
`zlib`) in `scripts/`, plus a three.js viewer page at the top of this folder, published
on GitHub Pages at https://andrewmaxwell.github.io/junk/ssx3/ (the Pages workflow deploys
the whole repo). It isn't on the junk homepage yet; when it is, add an entry to
`home/data.json` with `filePath: "ssx3"` (thumbnail `image.png` is ready). Everything was
reverse engineered in this repo;
GlitcherOG's PS2 research (github.com/GlitcherOG/SSX-Library, `SSX3PS2/`) was a
useful starting point, but the GameCube files differ in the details below.

Disc image: `~/Downloads/SSX 3 (USA)/SSX 3 (USA).rvz` (the default in every script).

## Commands

```
cd scripts
python3 list_geometry.py                  # table of locations and what geometry each has (~4s)
python3 list_geometry.py --export BHP1    # one location's terrain patches -> BHP1.obj (ALL = everything)
python3 export_viewer.py                  # -> ../data/*.bin, ~15s
cd .. && python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/
```

Everything here is committed and published, `data/` included. The user is fine with that as long
as the data is our own re-encoding, **never bytes copied verbatim from the disc** (no raw
chunks, no GameCube texture layouts); see "Data files" below. Re-export only when the data
actually changes: every export adds ~24 MB of binaries to git history. Exports are
deterministic (gzip mtime 0), so an unchanged world gives unchanged files.
OBJ exports (`*.obj`, `out/`) are gitignored. The page needs HTTP (it fetches
and uses a Worker); file:// shows a message saying so. Edit `index.html` and
`worker.js` directly, no build step.

The page exposes `window.viewer = { camera, controls, scene }` for poking at from the
console; `await import('three')` works there too (the import map applies).
Automated clicks can't take pointer lock, and the extension's scroll action doesn't
reach MapControls; dispatch `WheelEvent`/`KeyboardEvent` via JS instead. Clicks on the
location list can land before the page finishes building; click labels via JS
(`[...document.querySelectorAll('#list label')].find(...)`).

## Files

| File | What |
|---|---|
| `scripts/rvz.py` | RVZ (Dolphin) reader: zstd groups, RVZ packing (junk -> zeros), GameCube FST |
| `scripts/refpack.py` | EA RefPack (0x10FB) decompressor |
| `scripts/ssx3.py` | World format: BIG archive, sections/chunks, patches, models, instances, textures, lighting |
| `scripts/gxtex.py` | GameCube texture decoding (CMPR, C8+RGB5A3), mip levels, averages, PNG writer |
| `scripts/list_geometry.py` | CLI inventory + terrain OBJ export (`describe()` names locations) |
| `scripts/export_viewer.py` | Builds the streaming viewer data (`data/`) |
| `index.html` | The viewer page: three.js 0.170 from jsdelivr, controls, UI |
| `worker.js` | Web Worker: fetch, gunzip, decode textures, tessellate terrain, bake placements |

## Disc and world container

- Everything is in `data/worlds/bam.big` ("big ass mountain"): EA **BIGF** archive,
  big-endian offsets/sizes, holding `bam.gdb`, `bam.gsb`, `bam.ghm`, `bam.gsm`, `serial.txt`.
- `bam.gdb`: header 0x50 bytes (`u32 ?, f32, u32 nLocations=49, u32 nChunks=275, u32 nSections=205`),
  then 49 location records of **88 bytes** (16-byte name first). Location index == the
  `track` byte in chunk headers. Track 255 = shared (texture/lightmap banks).
- `bam.gsb`: 0x8000-aligned blocks, each `"CBXS"|"CEND"`, u32, RefPack data. Skip
  positions without a magic (blocks longer than 0x8000). Decompressed blocks concatenate
  into a **section**; `CEND` ends it (205 sections). A section is a run of chunks with
  8-byte headers: `u8 type, u24 size, u8 track, u24 rid`.
- `bam.ghm`/`bam.gsm`: name hash map / string table (patch names). Unused so far.

## Location names

Codes are `<section letter><event><number>`: sections A-E, events BA/BC/RA/SS/HP, and the
number counts that event type across the mountain. The game has **three peaks**:
Peak 1 = sections A+B, Peak 2 = C+D, Peak 3 = E. Single letters are hubs, `X_YYYY` are
connectors, `?SKY` are skyboxes. In-game course names (`COURSE_NAMES` in
`list_geometry.py`) come from the run-poster list in `data/be/rwrdngc.dat`. Nothing on
the disc links names to codes in text; the pairing was read off each course's menu
picture in `data/ui/courspic.big` (one 256x256 CMPR `.gsh` per code, title in the
corner; image record at offset 0x30). Locale text is in `data/locale/*.loc`
(LOCH/LOCT/LOCL: 8-byte (hash, string index) entries, UTF-16LE strings).

## Chunk types (GameCube)

| Type | Meaning | Notes |
|---|---|---|
| 0 | material | u16 texture id, u16 second-layer texture (0xFFFF = none), ..., flags u16 at +12 |
| 1 | terrain patch | 430 bytes, see below |
| 2 | prefab model | GX display lists, see below |
| 3 | instance | 160 bytes, placement of a model |
| 9 | texture (bank on track 255) | 788 ids, re-streamed many times; keep first copy per rid |
| 10 | lightmap (bank on track 255) | 662, all CMPR |
| 12 | collision mesh | model-local coords; parsed but unused |
| 23 | vertex-buffer descriptor | 3 refs: position pool, UV pool, colour pool |
| 24 | vertex colour pool | RGB565, 2 bytes each (baked object lighting) |
| 25 | position pool | s16 x3, **scale 1/4** |
| 26 | normal table | 252 float3 unit normals (same in every track) |
| 27 | UV pool | s16 x2, **scale 1/4096** |
| 4-8, 11, 13-22 | particles, lights, splines, vis curtains, AI paths, audio, ... | names from PS2 research; unused |

References everywhere are packed `u8 track, u24 rid`.

## Terrain patches (type 1)

Bicubic surfaces. 16 control points at 0x40 (vec4 each) are **power-basis
coefficients stored highest order first**: reverse them, then
`S(u,v) = sum C[i*4+j] u^i v^j`. Corners S(0,0), S(1,0), S(0,1), S(1,1) equal the
points at 0x150..0x17F (verified). Other fields:
- 0x10: lightmap rect `(u, v, width, height)` in the lightmap
- 0x20: four corner UVs (same corner order as above)
- 0x180: bbox min/max
- 0x1A0: u16 texture id, 0x1A2: u16 lightmap id
- **Lightmap axes are swapped**: lightmap uv = `(lu + v*lw, lv + u*lh)`, where u is
  the first patch parameter. Proven by matching neighbouring patch edges (error 32 vs 265).

Game space is **Z-up**; the viewer converts to Y-up with `(x, z, -y)`. Units are unknown
(not centimetres; the superpipe is ~48k units long). Don't show real-world units.

## Prefab models (type 2)

- Header: `u32 id, u32 partCount, u32 partTableOff, ..., u32 descriptorRef @0x18,
  u32 displayListBase @0x1C, u32 materialCount @0x20, materialRefs[] @0x24`.
- **0x18 references a type-23 descriptor**, which names the position pool (and UV
  and colour pools). Big locations (ARA1, ASS1, CRA3, DRA4, DSS2, ESS3) have two
  position pools; using the wrong one gives huge spikes. Don't concatenate pools.
- Part table entries (16 bytes): `i32 parent, u32 partInfoOff (0 = transform-only),
  u32 extra, u32 matrixOff (0xFFFFFFFF = identity)`. Matrices are 4x4 row-major,
  row-vector convention (translation in the last row); compose with the parent.
- Part info: bbox (24 bytes), u32, u32 meshCount, u32 offset of mesh-record pointers.
  Mesh record: `u16 materialIndex, u16, u32 dlOffset (from dl base), u32 dlSize`.
- Display lists: GX primitives `0x98` strip, `0x90` tris, `0xA0` fan, `0x80` quads
  (low 3 bits = VAT). All vertices are **7 bytes**: `u16 posIndex, u8 normalIndex,
  u16 colourIndex, u16 uvIndex`. The colour index is relative to each instance's
  block in the colour pool.
- 9,947 single-part models match their stored bboxes; 28 are slightly off (unexplained).

## Instances (type 3, 160 bytes)

`0x08` 4x4 matrix (row-major, translation row 3), `0x48` bounding sphere, `0x58` bbox,
`0x78` model ref, `0x7C` f32 **uniform scale** (applied in model space; the matrix has no
scale; ~half of placements aren't 1.0, range ~0.5-3.6), `0x98` colour pool ref, `0x9C` **byte**
offset into that pool. Bbox at 0x58 includes the scale (95% match within 5%).

## Textures and lighting

- Texture record: `u8 type, u24 next, u16 w, u16 h, ...`, pixels at +0x20.
  `0x1E` = CMPR (DXT1 in 8x8 tiles of four 4x4 blocks, big-endian).
  `0x19` = C8 (8x4 tiles) followed by a `0x32` palette block (count at +4, RGB5A3 at +0x20).
  Not every texture stores a full mip chain.
- Lightmaps are coarse: a median 14x14 texels per patch (~360 game units per texel), CMPR
  4x4 blocks, packed into 256x256 sheets with 1-texel gutters and **no mips**. The viewer
  samples them without mipmaps (mips blended neighbouring patches at a distance). Blocky,
  rectangular tree shadows up close are inherent to the data.
- Baked lighting is stored at half strength (128 = 1.0) and doubled; in linear space
  the viewer multiplies by `2^2.2`. Unlit `MeshBasicMaterial` divides lightMap by pi,
  so `lightMapIntensity = gain * PI`, base colour white.

## Viewer design decisions (and why)

- **Terrain is always opaque.** Road textures (e.g. 375-379, 239, 240) keep a full image
  in colour and a streaky mask in alpha; treating alpha as transparency made roads flicker.
- **Panels** (shown by default; hidden until textures existed): big models whose faces are all parallel (tree-line
  cards and backdrops with see-through textures).
- **Helpers** (hidden by default):
  - translucent, saturated, flat-colour textures (17, 44, 317, 556, 734; orange/purple/green
    editor volumes);
  - **placeholder** models using a tiny flat dark texture (137 dark grey = point-multiplier
    cubes, 222 black = slabs by jumps, 432 black).
  - `EDITOR_TEXTURES` (345: an arrow with corners numbered 1-4, on boxes over the CHP2 pipes).
- **Blocks** (hidden by default): bare closed boxes (12 triangles, 8 corners) at least 2000
  units on a side, e.g. the snow/ice slabs on ARA1 (Snow Jam). They use real textures (249,
  251 also appear on detailed models), so they're probably invisible blockers but unproven.
- No field in the placement records marks objects invisible (0x74 is an ID; the rest is
  constant), so every hidden category above is a heuristic.
- The tall dark boxes on the Peak B superpipe are real **skyscrapers** (city backdrop).
- Materials with a second texture layer (~100, flag 0x31; second layers 50/62/198/297 are
  sparkle/glitter) probably get a shine or env effect in the game. That's not reproduced.
- Streaming: `data/overview.bin` (low detail, baked colours) loads first, its download
  started by a plain script before three.js arrives; each location's `data/<NAME>.bin`
  plus the shared `data/textures.bin` load when the camera is within about 2 radii. All
  decoding and mesh building happens in `worker.js`, which transfers ready typed arrays
  (positions, normals, UVs, colours, indices, RGBA pixels); the page only makes three.js
  objects, so streaming doesn't stutter. Up to 8 locations stay loaded (4 on touch devices);
  freeing one disposes its geometry, lightmaps, own textures and materials.
- Camera (map mode, default): nothing depends on a hidden pivot distance, because that made
  speeds erratic (MapControls scaled pan/zoom by the distance to a pivot that re-aimed at
  each gesture, often at far terrain or sky).
  - Left-drag grabs the ground under the cursor and keeps that point pinned under it (a
    horizontal plane through the grabbed point; steps capped near the horizon).
  - Scroll / pinch move toward the point under the cursor by `exp(deltaY * 0.002)` of the
    distance (pinch x5); a continuous gesture keeps the same anchor. View direction unchanged.
  - OrbitControls only rotates (right-drag / Shift-drag), pivoting on the ground at screen centre.
  - W A S D speed follows the camera's height above the terrain below (eased).
  - Off-terrain fallback: a level plane at the height of the ground below the camera.
  Fly mode is behind the Camera button. Scroll must never change speed (awful on a Mac
  trackpad); speed is on `-` / `=`.
  `window.viewer.debug()` shows key/speed state and has `state(name)`, `detailed()`, `pick(x, y)`.
- Testing gotchas: tabs driven by the Chrome extension are usually hidden (background).
  - requestAnimationFrame doesn't fire, so nothing renders and matrices only refresh on render;
    `pickAt` calls `camera.updateMatrixWorld()` first. Take a screenshot to force a frame.
  - Timers are throttled to ~1/s, so tests with many `setTimeout` waits time out (45s CDP
    limit). Dispatch synthetic Pointer/Wheel/Keyboard events synchronously instead.

## Data files (`data/*.bin`)

Each is `gzip(u32 headerLen, JSON {meta, sections: {name: [offset, length, shuffle]}},
8-aligned binary sections)`, little-endian. `shuffle` > 0 means the section is stored as
byte planes (all first bytes of each number, then all second bytes, ...): gzip packs int16
and float32 data 10-15% smaller that way. The worker undoes it.
- Textures: CMPR becomes standard **BC1/DXT1** (blocks row by row, little-endian colours,
  first pixel in the low bits: `gxtex.to_bc1`); C8 becomes row-major indices plus an
  **RGBA8 palette** (`gxtex.to_indexed`). Lightmaps are BC1 too. Verified pixel-identical to
  `gxtex.decode` for all 788 textures.
- Object vertex colours: RGB8 pools (`gxtex.rgb8_colors`); each placement's start is a
  colour index (the disc's byte offset / 2).
- Textures used by >= `SHARED_BY` (5) locations live in `textures.bin` (~1 MB); the rest
  are copied into each location's file that uses them (8 MB in all vs 7 unique, but the
  first place you visit needs much less). Per-texture flags (helper, additive) are in the
  overview so the worker can sort meshes before textures arrive.

## Touch and phones

`(hover: none)` means a touch device: touch help text, no fly mode, fewer loaded
locations. Under 640px wide the panel starts collapsed ("Places") and readouts move to
the bottom. Touch never reaches OrbitControls:
- One finger: the same ground grab as the mouse.
- Two fingers: pinch zooms toward the ground between them, twisting turns the view around
  that point, and sliding both up or down tilts. Each finger's moves arrive as separate
  events, so tilt adds up each finger's vertical movement and applies only what both share.
- Double-tap glides to a spot (the dblclick handler ignores touch); long-press (550ms)
  inspects.
Testing: dispatch `PointerEvent`s with `pointerType: 'touch'` and distinct `pointerId`s.

## Finding a spot the user reports

The viewer keeps the camera in the address (`index.html#view=cx,cy,cz,tx,ty,tz`, scene
units) and Option-click / `I` / long-press shows what's under the cursor: location, terrain patch rid
or placement rid + model (track, rid), texture id, game xyz. "Copy view + details" puts
both on the clipboard. To investigate a pasted report: serve this folder, open the URL
with the same `#view=`, and look up the rids in `World.chunks` (patch rids are
`chunks[track, 1]`, placement rids `chunks[track, 3]`, models `chunks[track, 2]`).

## Open questions / ideas

- Road alpha masks, and the second-layer sparkle materials: what the game actually does.
- Plain 12-triangle boxes (some huge) that might be invisible blockers.
- Splines (type 8) for a ride-the-course camera; collision meshes (type 12) are in model space.
- 3D-print export (the original goal): add thickness to the terrain and a base, then write STL.
- The user's preferences: commit straight to master in ~/junk, staging only this folder
  (`ssx3/`).
