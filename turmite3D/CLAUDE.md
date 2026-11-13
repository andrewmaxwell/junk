# voxels (3D Turmites)

- Run `node --test turmite3D/turmite.test.js` after touching `turmite.js` or `mesher.js`. The reference implementation in the test is deliberately slow and different (string keys, Rodrigues rotations). Don't "simplify" it to share code with `turmite.js`, or it stops being an independent check.
- Presets came from a brute-force search over all rules of up to 5 letters (300k steps each), followed by looking at the candidates. Measured, so nobody repeats it:
  - Most compact blobs look alike.
  - A mirror-symmetry score found nothing truly symmetric up to 6 letters (best ~0.74).
  - Many rules become highways within a few thousand steps. The visually distinct ones were picked: coral, highway after chaos, necklace (`ULLB`, a slow diagonal string of crystals), caterpillar (`UNLNL`) and spire (`LUDD`). The last two were later dropped from the preset list to make room for the multi-ant ones.
- The original 2023 version painted each voxel at the ant's new cell with the old cell's state, so about a third of what it showed was wrong. It also turned by stepping a counter through six fixed directions rather than relative to the ant.
- Multi-ant presets came from the same kind of search with 48 ants (20k steps, rules up to 5 letters): 776 stay compact. The sparse ones are the crystals worth looking at. `LRRL`, `UND`, `LNBLN`×24 and `UDNN`×8 keep growing slowly past 600k steps. `LLBRB` and `LLRRN` shoot off on highways by 100k–300k.
- Ants must not start stacked on one cell: they advance it together, and when the stack size is a multiple of the number of states nothing ever changes (`LRUD` with 48 ants at the origin built 0 voxels). That's why several ants start at the images of (3, 1, 2).
- Tried and removed: three.js `GTAOPass` (screen-space ambient occlusion). It cost about 8 ms a frame at 1280×720 on an M4 and was barely visible next to the per-vertex AO and shadows.
- Tone mapping is off on purpose. Neutral tone mapping in `OutputPass` crushed the dark background and shadows, and the lights are set so lit colors stay under 1.
- The time slider rewinds by re-simulating from step 0. Old meshes stay up and are replaced chunk by chunk, so there's no blank frame.
