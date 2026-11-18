Reaction Diffusion - 2023 - Two simulated chemicals feed on and spread through each other, forming spots that divide, coral, mazes and worms. Drag to paint; explore the whole feed/kill map.

This is the Gray-Scott model. Chemical A is fed in everywhere at rate F. Where it meets B, two B's turn an A into a third B, and B is removed at rate F + k. Both chemicals spread out, B half as fast as A. Depending on F and k, the result is spots that keep dividing, labyrinths, worms, holes, or restless crescents and waves.

- **Pattern** jumps to a named spot in F/k space. F and k glide there, and fresh seeds are scattered over what's already on screen, so you can watch one pattern turn into the next.
- **The card's map** shows F (up) against k (right). Drag on it to change them live. The dots are the presets. The dashed line is k = √F/2 − F: to its left, A and B can settle into a smooth uniform blend; to its right, pure A is the only uniform state, and B survives only as patterns, if at all.
- **Map of every F, k** runs every point of that square at once, F rising up the screen and k across it, the way Pearson's 1993 figure catalogued them. Tap a spot to use its F and k everywhere.
- Drag to paint seeds of B. Right-drag, shift-drag or **Brush erases** wipes back to pure A. Space pauses, M toggles the map.
- If B dies out everywhere, it says so and scatters new seeds; if those die too, nothing survives at that F and k.
- The URL keeps the pattern (or F and k), the colors, and whether the map is showing, so a link reproduces the settings. Patterns grow from random seeds, so they won't come out exactly the same.

It runs on the GPU in WebGL2, at about one cell per 2.5 CSS pixels, so patterns are the same size on a phone and a monitor. It uses Pearson's diffusion rates, grid spacing and time step (Da = 2×10⁻⁵, Db = 10⁻⁵, 256 cells per 2.5 units, dt = 1), so F and k mean the same here as in his paper and Robert Munafo's Xmorphia catalog. The Laplacian is the isotropic 9-point stencil, so spots come out round.
