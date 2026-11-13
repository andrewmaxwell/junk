3D Turmites - 2023 - Langton's ant on a cubic grid: type a rule of turns and pitches, and watch an ant build coral, necklaces and highways out of voxels.

# 3D Turmites

An ant walks a 3D grid of cells. Each cell has a state, and the rule gives one letter per state:

- **L / R** turn left or right
- **U / D** pitch up or down
- **N** carry straight on
- **B** turn back

Each step the ant reads its cell's state, turns by that state's letter, advances the cell to the next state (wrapping to 0), and steps forward. The ant keeps track of which way is up, so "left" is always its own left. A rule of only L and R never leaves the plane, so `RL` is exactly Langton's ant, highway and all.

Type a rule (2–12 letters), pick a preset, or roll a random one. Random only offers rules that build a real sculpture for at least 30,000 steps, though plenty turn into a highway after that. Drag to orbit and scroll or pinch to zoom. Space pauses and `.` takes one step. **Copy link** puts the rule and step count in the URL, so a shared link reopens the same sculpture, paused.

## Notes

- Every rule is deterministic: the ant starts at the origin facing +x with +y up.
- Many rules wander chaotically for a while and then lock into a *highway*, a pattern that repeats while moving in a straight line forever, like 2D Langton's ant does after about 10,000 steps. `LRUD` does it after about 94,000 steps, and even the default `LRULL` does it after about 400,000. Turn on **Follow the ant** to stay close once it does.
- It pauses when it would draw more faces than the device's budget (5M on desktop, 1.5M on touch devices), store more than 8,000 chunks (3,000 on touch devices), or reach ±32,000 cells.
- Colors run through OKLCH hue by state, with darker shades for later states. Corners hemmed in by neighbors are darkened with per-vertex ambient occlusion.

## Code

- `turmite.js`: the ant and an unbounded grid of 32³ byte chunks. It runs about 35M steps/s in Node.
- `mesher.js`: builds one mesh per chunk, with only the faces that touch empty cells, plus colors and ambient occlusion.
- `main.js`: three.js scene, camera framing, lil-gui controls and URL state.
- `node --test voxels/turmite.test.js` checks the ant cell for cell against a slow, independent version that turns with rotation matrices. It also checks that `RL` reaches Langton's highway (period 104, moving 2 cells diagonally) and that the mesher emits exactly one outward-facing quad per exposed face.
