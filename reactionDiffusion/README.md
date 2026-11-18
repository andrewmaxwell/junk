Reaction Diffusion - 2023 - Two simulated chemicals feed on and spread through each other, forming spots that divide, coral, mazes and worms. Drag to paint; explore the whole feed/kill map.

This is the Gray-Scott model. Chemical A is fed in everywhere at rate F. Where it meets B, two B's turn an A into a third B, and B is removed at rate F + k. Both chemicals spread out, B half as fast as A. Depending on F and k, the result is spots that keep dividing, labyrinths, worms, holes, or restless crescents and waves.

- **Pattern** jumps to a named spot in F/k space. F and k glide there, and fresh seeds are scattered over what's already on screen, so you can watch one pattern turn into the next.
- **Drift F and k** (on by default) lets each part of the screen sit at slightly different, slowly wandering settings: F slides along the dashed line, where the patterns are, and k keeps its distance from it. Borders between regimes keep moving, so even patterns that would freeze keep reorganizing. The card plots the spread of settings on screen and gives their range.
- **Stir** carries everything along a slow, swirling flow, the curl of a wandering stream function, so it neither piles chemicals up nor thins them out. This isn't part of Gray-Scott; it's stirring added on top, and it turns mazes into flowing fingerprints. Off by default.
- **Trails & growth**: newborn B glows in each palette's accent color and fades over a few seconds, so you can see where things are growing, and B that has just left a spot leaves a fading trail.
- **Tour when idle**: after 20 seconds with no input it moves through the presets and palettes, one every 25 seconds. Touching it takes back control; after that it waits 90 seconds before touring again.
- **The card's map** shows F (up) against k (right). Drag on it to change them live. The dots are the presets. The dashed line is k = √F/2 − F: to its left, A and B can settle into a smooth uniform blend; to its right, pure A is the only uniform state, and B survives only as patterns, if at all.
- **Map of every F, k** runs every point of that square at once, F rising up the screen and k across it, the way Pearson's 1993 figure catalogued them. Tap a spot to use its F and k everywhere.
- Drag to paint seeds of B. Right-drag, shift-drag or **Brush erases** wipes back to pure A. Space pauses, M toggles the map.
- If B dies out everywhere, it says so and scatters new seeds; if those die too, nothing survives at that F and k.
- The URL keeps the pattern (or F and k), the colors, drift, stir, trails, and whether the map is showing, so a link reproduces the settings. Patterns grow from random seeds, so they won't come out exactly the same.

It runs on the GPU in WebGL2, at about one cell per 2.5 CSS pixels, so patterns are the same size on a phone and a monitor. It uses Pearson's diffusion rates, grid spacing and time step (Da = 2×10⁻⁵, Db = 10⁻⁵, 256 cells per 2.5 units, dt = 1), so F and k mean the same here as in his paper and Robert Munafo's Xmorphia catalog. The Laplacian is the isotropic 9-point stencil, so spots come out round.
