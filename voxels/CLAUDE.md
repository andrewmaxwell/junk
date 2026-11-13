# voxels (3D Turmites)

- Run `node --test voxels/turmite.test.js` after touching `turmite.js` or `mesher.js`. The reference implementation in the test is deliberately slow and different (string keys, Rodrigues rotations). Don't "simplify" it to share code with `turmite.js`, or it stops being an independent check.
- Presets came from a brute-force search over all rules of up to 5 letters (300k steps each), followed by looking at the candidates. Measured, so nobody repeats it:
  - Most compact blobs look alike.
  - A mirror-symmetry score found nothing truly symmetric up to 6 letters (best ~0.74).
  - Many rules become highways within a few thousand steps. The visually distinct ones were picked: coral, highway after chaos, necklace (`ULLB`, a slow diagonal string of crystals), caterpillar (`UNLNL`) and spire (`LUDD`).
- The original 2023 version painted each voxel at the ant's new cell with the old cell's state, so about a third of what it showed was wrong. It also turned by stepping a counter through six fixed directions rather than relative to the ant.
