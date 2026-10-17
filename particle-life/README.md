Particle Life - 2026 - 200,000 particles in eight colors, each attracted to or repelled by the others by a random rule. They gather into worms, cells, and swimmers. Runs on WebGPU.

Every pair of particles closer than `core` (a fraction of `radius`) pushes apart, whatever their colors, and the push grows the closer they get (like 1/distance, capped). Past the core, out to the pair's reach, each pair of colors pulls together or pushes apart by its own random attraction (-1 to 1), strongest halfway out and fading to zero at both ends. The rules aren't symmetric, so red can chase blue while blue runs from red, and that's where the moving creatures come from. Reaches run from `minReach` to 1 times `radius`, so red might feel blue from far away but only notice other reds up close, which makes layered things like cells with insides.

The core is what keeps blobs from collapsing. With a push that stays bounded, a blob of thousands of particles pulling inward always wins, and they pile into a single point; with one that grows as they get closer, packing them tighter always costs more than the pull can pay. `repulsion` and `force` are tuned together: weaker repulsion lets dense blobs come back, and too much of either (or very dense worlds, like a million particles with a small window) makes the steps overshoot and the whole world boil. If it boils, lower `force` or `radius`.

The world wraps around at its edges, so nothing piles up against a wall and creatures can keep swimming.

The `attractions` grid shows the rules: each row is a color, each column is the color it reacts to, green pulls and red pushes, and the size of the square is how far it reaches. Click a square to make it pull more, right-click or shift-click to make it push more, and scroll over it to change its reach. Hit `new rules` for a new random world. Changing the particle count scatters them again, changing the number of colors makes new rules, and the rest change the world live. The motion scales with `radius`, so a smaller radius with more particles gives the same behavior with more, smaller creatures.

Scroll or pinch to zoom in where the pointer is, right-drag or shift-drag to pan, and double-click to see the whole world again. Dragging does whatever the `tool` is:

- `stir` drags particles along with the pointer.
- `pull` and `push` draw particles toward the pointer or blow them away.
- `paint` turns particles into the paint color. Click a color along the top of the grid to pick it.
- `follow`: click something and the camera stays on it. Each frame the GPU adds up where the particles near the middle of the screen are, and the camera drifts to their middle.
- `pan` drags the view.

Particles are drawn as soft dots stretched back along their velocity (`streaks`), added into a float texture that fades by `trails` each frame, then tone mapped, so dense clusters glow toward white and moving ones leave tails.

The URL hash holds the rules and any settings that differ from the defaults, so the address bar is always a link back to the current world (from a new random start).

- `sim.js` runs it on the GPU. Each step, particles are counted into grid cells one radius wide (atomic adds), a prefix sum turns the counts into where each cell starts, particles are copied into their cell's run, and then each one reads its 3x3 block of cells, adds up the forces, and moves.
- `render.js` draws the streaks, the trails, and the tone mapping.
- `input.js` handles the camera and the pointer tools.
- `main.js` has the settings, the rule grid, and the URL hash.
