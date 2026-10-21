# bz

Notes on the Oregonator setup in `main.js`, measured while tuning it in October 2026.

- With q = 0.002 the resting state is stable only when f is above about 2.4 (the slope of the reaction term at rest has to be below ε). The often-quoted f = 1.4 *oscillates*, and so does every f down to 0.5. That's why the spirals preset uses f = 3.
- The reaction is too stiff to step explicitly with a useful dt (its slope reaches thousands in the refractory tail), so u is solved by backward Euler with 4 Newton iterations per step, while diffusion stays explicit. dt = 0.01 is under the 9-point stencil's diffusion limit of 0.375 dx².
- One bare oscillation takes about 5 time units, and spirals turn about that fast too. The first version stepped 50 times per frame (about 44 units/s), so spirals spun several times a second. It now steps by the clock at 2.5 units/s. Screenshots from a hidden or throttled browser pane look calm even when it's far too fast, so measure in a visible browser.
- DX = 0.2 gave a spiral wavelength of about 300 px on a laptop. DX = 0.3 fits more spirals and still looks round. The grid is sized to about 700 cells across the short side of the screen, so phones show the same composition (about 1M cells, 250 steps/s).
- Short seed fronts (8 to 20 units) pair up and annihilate, and within about 15 s one spiral takes over the dish. Fronts of 20 to 45 units leave many spirals that last.
- Dropped: an "Oscillating" preset at f = 1, which just flashes the whole dish red and blue in sync. Pacemakers 4 to 6 units across didn't fire any faster than 2.5 to 4, they just stayed lit up.
- The nutshell model used to run in 8-bit canvas pixels, and that rounding changed its dynamics. It now uses floats, as Turner's original does. Its waves are 3 cells long, so its cells stay a whole number of pixels across, or they shimmer with moiré.
- Half-float textures (the fallback when EXT_color_buffer_float is missing) look the same as 32-bit ones.
