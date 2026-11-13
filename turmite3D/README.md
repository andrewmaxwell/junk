3D Turmites - 2026 - Langton's ant on a cubic grid: type a rule of turns and pitches, and watch up to 48 ants build cages, stars, coral and highways out of voxels.

# 3D Turmites

An ant walks a 3D grid of cells. Each cell has a state, and the rule gives one letter per state:

- **L / R** turn left or right
- **U / D** pitch up or down
- **N** carry straight on
- **B** turn back

Each step the ant reads its cell's state, turns by that state's letter, advances the cell to the next state (wrapping to 0), and steps forward. The ant keeps track of which way is up, so "left" is always its own left. A rule of only L and R never leaves the plane, so `RL` is exactly Langton's ant, highway and all.

Type a rule (2–12 letters), pick a preset, or roll a random one. Random only offers rules that build a real sculpture with one ant for at least 30,000 steps, though plenty turn into a highway after that. Drag to orbit and scroll or pinch to zoom. Space pauses and `.` takes one step. **Copy link** puts the rule, the number of ants and the step count in the URL, so a shared link reopens the same sculpture, paused.

## Several ants

**Ants** starts 2, 4, 8, 24 or 48 ants as mirror images or rotations of the first, a few cells from the origin. Each step they all read their cells before any of them writes, so the result doesn't depend on their order, and the sculpture keeps the symmetry of the formation forever: 48 ants have the full symmetry of the cube. A mirrored ant is left-handed, so its L is a right turn. The same rule usually builds something quite different with more ants: `LRRL` never leaves the plane with one ant, and builds an octahedral cage with 48.

## Time

Drag **Time** to scrub back and forth through the sculpture's history. The simulation is deterministic, so going back just replays it from step 0, which takes a few frames for a few hundred thousand steps.

## Color

**Color by Age** shades each voxel by when an ant last left it, from indigo for the oldest through magenta and orange to pale yellow for the newest (on a squared scale, so the palest colors are kept for the last moments). It shows the order in which the sculpture grew. **State** gives each cell state its own color instead, which shows the rule at work.

## Notes

- Every rule is deterministic: a single ant starts at the origin facing +x with +y up.
- Many rules wander chaotically for a while and then lock into a *highway*, a pattern that repeats while moving in a straight line forever, like 2D Langton's ant does after about 10,000 steps. `LRUD` does it after about 94,000 steps, and even the default `LRULL` does it after about 400,000. Turn on **Follow the ant** to stay close once it does.
- It pauses when it would draw more faces than the device's budget (3M on desktop, 1M on touch devices), store more than 2,000 chunks (600 on touch devices; each is 160 KB), or reach ±32,000 cells.
- Corners hemmed in by neighbors are darkened with per-vertex ambient occlusion, and one light, up and to the left of the viewer, casts soft shadows. The ants glow through the sculpture so you can always find them.

## Code

- `turmite.js`: the ants and an unbounded grid of 32³ chunks holding each cell's state and the step it was last visited. One ant runs about 20M steps/s in Node.
- `mesher.js`: builds one mesh per chunk, with only the faces that touch empty cells. Each vertex carries its cell's state, age and ambient occlusion, about 0.7 ms per chunk.
- `main.js`: three.js scene, the shader that turns state and age into color, camera framing, time scrubbing, lil-gui controls and URL state.
- `node --test turmite3D/turmite.test.js` checks the ants, states and ages cell for cell against a slow, independent version that turns with rotation matrices, for every formation. It also checks that 48 ants keep the cube's symmetry, that `RL` reaches Langton's highway (period 104, moving 2 cells diagonally) and that the mesher emits exactly one outward-facing quad per exposed face.
