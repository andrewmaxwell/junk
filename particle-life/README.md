Particle Life - 2026 - 200,000 particles in several colors, each attracted to or repelled by the others by a random rule. They gather into swimmers, comets and cells, and new rules are tested for life before you see them. Runs on WebGPU.

Every pair of particles closer than `core` (a fraction of the interaction radius) pushes apart, whatever their colors, and the push grows the closer they get (like 1/distance, capped). Past the core, out to the pair's reach, each pair of colors pulls together or pushes apart by its own random attraction (-1 to 1), strongest halfway out and fading to zero at both ends. The rules aren't symmetric, so red can chase blue while blue runs from red, and that's where the moving creatures come from. Reaches run from `minReach` to 1 times the radius, so red might feel blue from far away but only notice other reds up close, which makes layered things like cells with insides.

The core is what keeps blobs from collapsing. With a push that stays bounded, a blob of thousands of particles pulling inward always wins, and they pile into a single point; with one that grows as they get closer, packing them tighter always costs more than the pull can pay. `repulsion` and `force` (under world › physics) are tuned together: weaker repulsion lets dense blobs come back, and too much of either, or too high a `density`, makes the steps overshoot and the whole world boil. If it boils, lower `force` or `density`.

## The world

The world is a square that wraps around at its edges, so nothing piles up against a wall and creatures can keep swimming. Its size comes from the particle count and `density` (particles per radius × radius square), not from the window, so a phone and a desktop show the same world at the same density. It used to be exactly the window: a phone packed 200k particles into a quarter of a desktop's area and boiled, and resizing the window squashed the world. The camera starts zoomed in about 400 world units across the screen's short side, where creatures are big enough to see. Zoom out to see everything.

Density 12 is the default. At 6 most worlds were a thin gas with few creatures, and at around 30 (what a 1280×720 window used to give) most were a fine froth.

## Finding life

Most random rules give a froth or a frozen crystal. `new rules` tries rule sets until it finds a world with creatures in it. Each candidate runs for 300 steps as fast as the GPU can (about 0.4 s on an M-series Mac) while the camera shows the whole world. Then one workgroup on the GPU measures it, cell by cell (cells are one radius wide):

- `speed`: the particles' average speed, as a fraction of the radius per step.
- `together`: how much of that is whole cells moving together (Σ over cells of |Σ velocity| ÷ Σ |velocity|). Particles jiggling in place cancel out, and a swimming clump doesn't.
- `clumping`: Σ count² ÷ particles, divided by what particles scattered at random would give (cell mean + 1), so 1 is evenly random and more means gathered into clumps.

The score is `speed × together × min(clumping, 6)`. It was calibrated by eye against screenshots of about 130 random worlds: the dullest froth scores under 0.005, and worlds full of swimmers score over 0.015. A world counts as alive above 0.012, which about one 8-color random world in seven reaches, so a search usually takes 1–3 s (0.5–5.4 s over five tries). After 20 failures it shows the best one and says so. The camera then glides to the cell moving together the fastest.

The `preset` menu has five worlds picked from the finder's best for being different from each other, and a first visit opens on a random one. `new rules` keeps the current number of colors, so new rules from a 4-color preset stay 4 colors.

## Using it

The `attractions` grid shows the rules: each row is a color, each column is the color it reacts to, green pulls and red pushes, and the size of the square is how far it reaches. Click or tap a square to make it pull more. Right-click, shift-click or long-press to make it push more. Scroll over it to change its reach. Changing the particle count or density scatters the particles again, changing the number of colors finds new rules, and the rest change the world live.

Scroll or pinch to zoom in where the pointer is. Drag with two fingers, the right button or shift held to pan. Double-click to glide out to the whole world. A one-finger or mouse drag does whatever the `tool` is:

- `stir` drags particles along with the pointer.
- `pull` and `push` draw particles toward the pointer or blow them away.
- `paint` turns particles into the paint color. Click a color along the top of the grid to pick it.
- `follow`: click something and the camera stays on it. Each frame the GPU adds up where the particles near the middle of the screen are, and the camera drifts to their middle.
- `pan` drags the view.

Particles are drawn as soft dots stretched back along their velocity (`streaks`), added into a float texture that fades by `trails` each frame, then tone mapped, so dense clusters glow toward white and moving ones leave tails. Dots grow with the square root of the zoom rather than the zoom itself, and get brighter by the same factor, so close up they stay distinct particles instead of blurring together.

The URL hash holds the rules and any settings that differ from the defaults, so the address bar is always a link back to the current world (from a new random start). Links from before the world had its own size still load, but they used the window's size, so they run at a different density now.

## Code

- `sim.js` runs it on the GPU. Each step, particles are counted into grid cells one radius wide (atomic adds), a prefix sum turns the counts into where each cell starts, particles are copied into their cell's run, and then each one reads its 3x3 block of cells, adds up the forces, and moves. `measure` computes the life stats above.
- `render.js` draws the streaks, the trails, and the tone mapping.
- `input.js` handles the camera (zoom, pinch, pan, glide, follow) and the pointer tools.
- `main.js` has the settings, the creature finder, the rule grid, and the URL hash.
- `presets.js` has the hand-picked worlds as URL hashes.
