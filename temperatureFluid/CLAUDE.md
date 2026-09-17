# Temperature Fluid

A 2D Jos Stam "Stable Fluids" solver coupled to a temperature field, rendered as
a color gradient with white velocity-tracing particles on top. Plain ES modules,
no build step, no dependencies except lil-gui from a CDN.

## Running it

Any static server from the repo root, then open `temperatureFluid/index.html`.
`main.js` imports `../sand/makeRenderer.js`, so serving this folder alone breaks
the import — serve the parent.

```
cd /Users/andrew/junk && python3 -m http.server 8731
```

## Files

| file | role |
|---|---|
| `index.html` | two stacked canvases; `#particleCanvas` is on top and receives pointer events |
| `main.js` | all tuning lives here: `params`, `view`, `brush`, the GUI, the rAF loop |
| `makeSim.js` | the solver. Everything below is about this file |
| `makeParticles.js` | 1000 particles advected by `sim.getVel`, drawn as short segments |
| `makePointer.js` | drag to push fluid, shift to paint hot, alt/right-button to paint cold |
| `../sand/makeRenderer.js` | shared LUT-based canvas renderer (`makeGradient`, `makeRenderer`) |

## Solver pipeline

`iterate()` runs, in order:

```
applyRegions()    relax the plate cells toward their target temperatures
applyBuoyancy()   yVel += (temp - startingTemperature) * buoyantForce * dt
swapBuffers()
diffuse(xVel) diffuse(yVel) diffuse(temp)   budget: diffusionIterations
project()         make it divergence-free (SOR; budget: iterations)
swapBuffers()
advect()          MacCormack on all three fields, then conserveMass()
project()
```

Each field has a `Prev` buffer; `swapBuffers` rotates current into previous and
reuses the old previous as the new destination, so buffers are always fully
overwritten before being read again. `pressure`, `divergence` and `reverted` are
dedicated scratch — do not alias them back onto the `Prev` buffers, which is
what the code originally did and which made it look like projection consumed
last frame's velocity.

Indexing is `x + res * y` (written inline as a hoisted `res * j` row offset), so
**`i` (x) is the contiguous axis**.

The grid is **staggered**, which is the single most important thing to know
before editing this file. With `N` interior cells and a ring of ghosts, all
sharing the stride `res`:

| field | lives on | index range | world position |
|---|---|---|---|
| `temp`, `pressure` | cell centers | 1..N | `((i-0.5)/N, (j-0.5)/N)` |
| `xVel` | vertical faces | i in 1..N+1 | `((i-1)/N, (j-0.5)/N)` |
| `yVel` | horizontal faces | j in 1..N+1 | `((i-0.5)/N, (j-1)/N)` |

Faces 1 and N+1 sit exactly on the walls, so they are pinned to zero and never
advected or projected — which is why the advection and projection loops start
at 2 along a face field's own axis. World coordinates run 0..1 across the
interior, so a displacement is simply `dt * velocity`. See the compressibility
section for why this layout is not optional.

## Invariants and gotchas

- **Loop order is `j` outer, `i` inner, everywhere.** Not just a preference:
  iterating the other way strides `res` floats per read and misses cache. For
  Gauss-Seidel the two orders produce the *bit-identical* iterate (either way
  the already-updated neighbors are exactly `(i-1,j)` and `(i,j-1)`), so this is
  a pure 1.22x win — verified at 0.00e+0 difference at 1/2/5/20 sweeps.
- **`canvasPerFrame() = params.dt` is the single unit conversion.** World
  coordinates already run 0..1 across the interior, so one unit of stored
  velocity moves `dt` of the canvas per frame. `getVel` multiplies by it,
  `addVelocity` divides by it, and nothing else may cross the sim/screen
  boundary. (On the old collocated grid this was `dt * N / res`, because that
  version measured displacement in cells; do not carry the old formula over.)
  An even older `getVel` scaled by `1/(2·dt²·N)`, which made particle speed
  wrong by 39.7x at `dt=0.01` and 0.044x at `dt=0.3`. `apitest.mjs` in the
  scratchpad asserts the round trip: `addVelocity` then `getVel` agrees to 0.7%.
- **Boundaries are three separate functions, one per layout**: `boundX`,
  `boundY`, `boundCenter`. On a staggered grid the normal velocity component
  sits exactly *on* the wall, so it is set to zero outright rather than
  mirrored with a sign multiplier the way the collocated version did; the
  tangential component and the scalars mirror, which is free slip and Neumann
  respectively. Pass the right one — `boundFor(kind)` picks it — or walls
  quietly leak momentum.
- **`sweepsFor(a)`** caps diffusion sweeps by its actual convergence rate
  (`4a/(1+4a)` per sweep). Weak diffusion converges to float precision in a
  handful of sweeps. **Viscosity 0 short-circuits to zero sweeps**, which is
  why dropping viscosity nearly halves frame time (5.2ms -> 2.9ms).
- **`diffusionIterations` is deliberately separate from `iterations`.** They
  shared one number until the SOR change, which silently coupled two unrelated
  things: lowering the pressure budget also cut the viscosity actually applied,
  so a cheaper solve looked like it came with a free flow speed-up when it had
  really just stopped being viscous. That one confound produced a fake "4x
  faster" result mid-investigation. Measured properly, 4 diffusion sweeps are
  indistinguishable from 32 (divergence 1.68e-3 vs 2.03e-3, grid noise 0.0022
  vs 0.0023, identical interior SD) and save 19ms a frame. If a params object
  omits it, `sweepsFor` falls back to `iterations` — without that fallback the
  budget is `undefined`, `Math.min` is NaN, and the sweep loop runs zero times
  *and skips its boundary pass*, which is a wrong answer rather than an error.
- **`conserveMass()` must stay exactly where it is** — immediately after the
  temperature advection, inside `advect()`, before the next `swapBuffers()`.
  It works by comparing the interior total against `tempPrev`, and `tempPrev`
  only holds the pre-advection field at that one moment. More importantly it
  must correct *advection* error and nothing else: `applyRegions` and `diffuse`
  both change the total legitimately, because the plates are real heat sources.
  Moving this call after `applyRegions` would cancel the plates out entirely
  and freeze the simulation, and it would look like a subtle drift bug rather
  than an obvious break.
- `divergence` deliberately gets no boundary pass: the pressure sweep reads it
  only at interior cells.
- `applyRegions` relaxes toward a target rather than accumulating, so sources
  cannot run away, and the field stays inside the range spanned by the targets
  and `startingTemperature`.
- **The GUI slider ranges are load-bearing, not cosmetic.** `diffusionRate`
  lives at 3e-6 and its useful band is 1e-6..5e-5, so the step must be ~5e-7.
  A generic `0, 0.002, 0.00001` slider — which is what was there originally —
  has a step larger than the value itself, cannot express the default, and
  snaps the most important lever in the sim to 0 on first touch. Same reason
  viscosity is floored above 0: it reaches a grid-noise state there.

## Measured performance

**Measured in Chrome on an M4 MacBook Pro: 119fps median** at the shipped
config (res 256, `iterations` 4, `diffusionIterations` 4). Mean frame 11.2ms;
of 599 sampled frames 390 landed on the 120Hz vsync and 209 on the 60Hz one.
Before the SOR change the same page ran at **24fps**.

Note the browser is *faster* than node for this workload, not slower: 8.4ms a
frame against node's 13.4ms. An older note in this file claimed the opposite
(1.6x slower) — that was never measured at this resolution and was wrong.
Because rAF is vsync-quantized, a browser frame time is only ever a multiple of
8.33ms; bucket the deltas rather than reading a mean, or a 9ms frame and a 16ms
frame look identical.

Where a frame goes, at res 256 (node, sim only, measured by varying the budget
and fitting the line):

| stage | ms | note |
|---|---|---|
| projection, 4 SOR sweeps | ~8.5 | was 29.4ms at 32 Gauss-Seidel sweeps |
| advection (3x MacCormack) | ~4.6 | 9 grid passes with a bilinear sample each |
| `conserveMass` | ~0.2 | two passes; stops the heat drift |
| diffusion, 4 sweeps | ~1.5 | was ~19ms when the budget was shared |
| regions, buoyancy, bounds | <0.5 | |

Everything outside `makeSim` is noise by comparison: the renderer is 1.21ms and
the 1000 particles are 0.48ms, and both of those were measured under a ~6x
penalty (a backgrounded tab), so their true cost is a fraction of that. The
fluid canvas has a 256x256 backing store that CSS scales to 772px, so the
renderer only ever fills 65,536 pixels.

Cost by config under the current solver, 2500 frames, `diffusionIterations` 4:

| config | ms (node) | divergence | maxCFL |
|---|---|---|---|
| res192 / 4 | 6.6 | 1.83e-3 | 0.48 |
| res224 / 4 | 10.0 | 1.77e-3 | 0.56 |
| **res256 / 4 (shipped)** | **13.4** | **1.68e-3** | **0.70** |
| res288 / 4 | 16.9 | 1.81e-3 | 0.63 |
| res320 / 4 | 21.1 | 1.53e-3 | 0.91 |
| res256 / 8 | 16.7 | 1.31e-3 | 0.72 |

res 256 is shipped because it is the largest that fits the 16.7ms budget *in
node*; the browser is faster, so res 288 would also hold 60fps if more
resolution is wanted. res 320 is where maxCFL gets fragile at 0.91.

**Do not read a detail ranking out of the resolution column.** S(1/64) ran
0.302 / 0.298 / 0.361 / 0.339 / 0.406 across 192..320 — non-monotonic, because
each run is an independent chaotic realization. This is almost certainly what
the old "res192 anomaly" in Open questions really was.

Two optimizations banked earlier still apply: the loop-order swap (10.75ms ->
8.80ms, bit-identical output) and `sweepsFor` capping diffusion sweeps by their
actual convergence rate.

**Multigrid is no longer the obvious next optimization.** It was the plan when
the pressure solve was 72% of the frame; SOR took that from 29.4ms to 8.5ms for
a four-line change, and the remaining projection cost is no longer dominant.
Advection is now the largest single stage.

## Physics decisions, with the numbers behind them

**MacCormack advection on all three fields.** Plain semi-Lagrangian is first
order; every step resamples through a bilinear filter, which is a blur. Four
independent tests:

- Solid-body rotation, one revolution, peak retained: SL 0.241, MacCormack
  clamped 0.993, unclamped 1.263 (unclamped overshoots above the true maximum,
  so the clamp stays).
- Forcing off, viscosity and diffusion zero — curl kept: SL 88.3%, MC-temp-only
  88.3%, MC-all 99.2%. Temperature structure: 69.1% / 100.7% / 100.1%.
- Scale-free sharpness index `RMS(laplacian T)/SD(T)`: 0.851 -> 1.186.
- No artifact introduced: checkerboard 5.19e-4 (SL) vs 5.58e-4 (MC); the clamp
  fires on only 0.2–0.5% of cells.

The clamp is to the range of the four cells the *forward* trace sampled, which
degrades to plain semi-Lagrangian exactly at sharp extrema — where overshoot
would be worst.

**Vorticity confinement: removed.** It was a dial, not a correction — a
non-conservative force of magnitude `ε·dt·|ω|`, so force ∝ existing vorticity is
positive feedback that injects energy by construction. Measured on a single
seeded vortex with forcing off, energy relative to frame 0 at frame 2000: 0.064
at ε=0, 1.250 at ε=1, ~2.4x at ε=3. It self-limits rather than diverging
(dissipation grows faster than the linear-in-|ω| injection), but it is
manufacturing structure. What it actually does is *not* shrink the core — the
second-moment radius is unchanged at ~25 cells — it makes the distribution
drastically more peaked (cells above half-peak 401 -> 15–29) with ~1000x more
grid-scale content. Full-width plates make it unnecessary.

**Rayleigh-Benard plates instead of point sources.** The current forcing. A
1-cell source can only make a jet; an unstable layer generates its own plumes.
Measured at identical viscosity with confinement off:

| forcing | unsteadiness | rmsCurl | vortex cores |
|---|---|---|---|
| points, ε=0.5 | 0.228 | 4.93e-4 | 50 |
| points, ε=0 | 0.279 | 2.81e-4 | 15 |
| plates, ε=0 | 0.919 | 1.57e-3 | 40 |

"Unsteadiness" = RMS change in the temperature field per 100 frames, normalized
by its own SD. 0 means frozen; ~1 means it keeps reorganizing.

**Plates need a noise seed.** Perfectly uniform plates are symmetric and stay
symmetric forever. `main.js` kicks the field once at startup with 400 tiny
`addHeat` calls.

**The view window trades span against contrast, and it is
resolution-dependent.** The plates are pinned at 0 and 1, but the convecting
interior clusters tightly around `startingTemperature` — and clusters *tighter*
as resolution rises, because finer grids put more of the variance into small
scales. Interior SD is 0.087 at res 128 and 0.0735 at res 256.

At res 256 the interior percentiles are 10% 0.430, 50% 0.510, 90% 0.597:
narrow, and skewed slightly hot. Measured at res 256:

| window | near-black | clipped | character |
|---|---|---|---|
| **0.10 / 0.90 (shipped, by request)** | **~38%** | ~0% | dark; whole brush range visible |
| 0.30 / 0.70 | 27.6% | 4.3% | |
| 0.40 / 0.65 | 11.4% | 6.2% | richest interior; clips plates and brush |
| 0.45 / 0.57 | 8.9% | 16.8% | blown out — flat yellow/cyan, gradient gone |

The shipped `{0.1, 0.9}` is an explicit preference for showing the full range
rather than for maximum contrast. Because the interior only spans ~0.43..0.60,
a window this wide compresses nearly all of it into the middle of the gradient,
which is the black band — hence the dark, red-dominated look. `{0.4, 0.65}` is
the contrast-maximizing alternative and is one slider away. **Re-derive
whenever `res`, buoyancy or the plate targets change; it does not transfer.**
At res 128 the equivalent of the narrow window is about `{0.3, 0.7}`.

**Keep viscosity at 1e-4 — do not set it to zero.** This was tested and
rejected. Grid-scale (Nyquist) content in the *velocity* field:

| viscosity | nyqV | unsteadiness |
|---|---|---|
| 1e-4 | 0.0174 | 0.940 |
| 3e-5 | 0.0322 | 0.281 |
| 0 | 0.25–0.31 | 1.048 |

Zero viscosity carries 14–18x more cell-to-cell oscillation, and **cutting `dt`
4x at equal simulated time does not reduce it** (0.2526 -> 0.3115 -> 0.3128), so
it is not a CFL artifact. It is visible as vertical streaking in a render.

## Compressibility is structural, not a convergence problem

The residual "squishiness" — particles bunching and spreading — **cannot be
fixed by raising `iterations`.** This was measured directly. Define:

- `wide` = the divergence `project` actually minimizes, `(u[k+1]-u[k-1])/2`
- `comp` = true cell-to-cell divergence, which is what a particle feels

| iterations | wide | comp | ms |
|---|---|---|---|
| 8 | 1.32e-2 | 1.66e-2 | 3.7 |
| 32 | 6.34e-3 | 1.73e-2 | 7.6 |
| 256 | 4.45e-3 | **1.79e-2** | 38.6 |

32x the sweeps and 10x the cost leaves `comp` *slightly worse*. The cause: this
is a **collocated** grid. Divergence and the pressure gradient both use a wide
2h central difference, which skips the immediate neighbor, but the Poisson
solve uses the compact 5-point Laplacian. `div·grad` is not that Laplacian, so
the odd and even sublattices decouple and grid-scale divergence sits in the
projection's null space, unreachable at any sweep count.

**A staggered MAC grid fixes it, and this was validated.** Velocities on cell
faces, pressure at centers; then `div·grad` is exactly the 5-point Laplacian.
Watch the asymptote (`mac.mjs`, `maciter.mjs` in the scratchpad):

| iterations | collocated native | MAC native |
|---|---|---|
| 16 | 3.21e-2 | 1.37e-2 |
| 256 | 4.06e-2 | 4.40e-4 |
| 1024 | **4.08e-2** | **3.57e-5** |

Collocated plateaus; MAC converges to zero like a consistent scheme must.

**This is now what `makeSim.js` does.** The collocated version is preserved in
git (commit 92341d3) and in the scratchpad as `makeSim.collocated.backup.js`.
Measured A/B at res 128, 4000 frames, identical params and seed:

| grid | native | comp | S(1/128) | S(1/64) | sdIn | ms |
|---|---|---|---|---|---|---|
| collocated | 5.04e-3 | 1.23e-2 | 0.186 | 0.349 | 0.0421 | 5.4 |
| MAC | 5.54e-3 | **8.12e-3** | 0.188 | 0.347 | **0.0590** | **5.3** |

34% less divergence in the velocity a particle samples, detail unchanged, and
**the same cost**. Interior temperature range widened from [0.217, 0.786] to
[0.053, 0.955] — the collocated scheme was bleeding hot and cold toward the
middle, so plumes now stay at full strength and the field renders much more
vividly.

Two things that made it free, both worth preserving if this is ever touched:

- The backtrace velocity at a node is assembled from the faces around it by
  plain averaging, not by interpolating the velocity fields. On a staggered
  grid those faces are exactly symmetric about the node, so the average equals
  what interpolation would give at a fraction of the cost. An early prototype
  used generic samplers instead and ran 1.9x slower — that cost was the
  samplers, not the grid.
- The MacCormack clamp must be to the four taps of the forward trace. The same
  prototype used a cruder ±h/2 four-point neighborhood and lost ~15% of the
  fine detail; with the correct clamp, detail matches the collocated version
  exactly.

**`iterations` is now a real lever, where on the collocated grid it was
worthless.** Native divergence halves per doubling (5.53e-3 / 3.33e-3 /
1.41e-3 / 7.07e-4 at 16 / 32 / 64 / 128). Iterations buys incompressibility
only — detail is flat across the whole sweep.

**Those counts are Gauss-Seidel history.** Under SOR the knee moved from ~64
sweeps to ~4: 4 sweeps reach 1.68e-3 and 8 reach 1.31e-3, so the shipped budget
is 4 and anything past 8 is wasted. Scale sweep counts by roughly 8x when
reading any pre-SOR number in this file.

## Detail: thermal diffusivity is the lever

Not resolution, and not viscosity. Measured at res 128, equal simulated time,
every run confirmed convecting, viscosity fixed at 1e-4:

| diffusionRate | S(1/128) | S(1/64) | nyqV | ms |
|---|---|---|---|---|
| 1e-4 | 0.074 | 0.144 | 0.0119 | 6.0 |
| 1e-5 (old) | 0.145 | 0.279 | 0.0128 | 5.2 |
| **3e-6 (current)** | **0.191** | **0.355** | 0.0234 | 5.2 |
| 1e-6 | — | — | — | **stalls** |

`S(r)` is a structure function, mean `|T(x+r) - T(x)|` at a fixed *physical*
separation, normalized by interior SD. It is comparable across resolutions,
which a grid-scale sharpness index is not.

3e-6 is near the floor: at 1e-6 the plates no longer conduct enough heat into
the fluid, convection never onsets, and the field goes black. Viscosity is a
much weaker lever and must stay at 1e-4 — lowering both together also stalls.

Resolution and sweeps interact. This table is **Gauss-Seidel history** — it is
what chose res 256, but its sweep counts are pre-SOR and its ms column is
obsolete. See Measured performance for the current numbers.

| config | comp | S(1/256) | S(1/128) | S(1/64) | maxCFL | ms |
|---|---|---|---|---|---|---|
| res128 / 16 | 8.35e-3 | n/a | 0.227 | 0.409 | 0.37 | 5.3 |
| res128 / 64 | 5.81e-3 | n/a | 0.230 | 0.415 | 0.37 | 12.6 |
| res192 / 16 | 6.97e-3 | 0.152 | 0.152 | 0.405 | 0.54 | 15.6 |
| res256 / 16 | 8.08e-3 | 0.131 | 0.252 | 0.454 | 0.89 | 32.3 |
| **res256 / 32** | **4.52e-3** | 0.124 | 0.241 | 0.437 | 0.66 | 49.5 |
| res256 / 64 | 3.15e-3 | 0.110 | 0.214 | 0.385 | 0.48 | 68.6 |

**res256 / 16 scores the best detail of anything here and must not be used.**
It has visible rectangular artifacts — a hard vertical edge on one side and a
right-angled block in a corner — from an under-converged projection at maxCFL
0.89 leaking pressure structure into the temperature field. The structure
function *rewards* those artifacts because their edges are genuinely sharp.
This is the clearest case in the project of a metric preferring a broken
result, and it was caught only by looking at a render.

res192 remains anomalously weak at S(1/128) — 0.131 to 0.152 across four
separate measurements, against 0.23-0.25 at both 128 and 256. Reproducible,
still unexplained, and not worth using.

That 50ms/frame was the Gauss-Seidel cost and is no longer what this runs at;
the shipped config is 13.4ms in node and 119fps in Chrome. **The old claim that
the browser runs ~1.6x slower than node was wrong** — it is measurably faster
here, 8.4ms against 13.4ms.

## Open questions

- **FIXED: the field used to gain heat without bound.** Fixed by
  `conserveMass()` in `makeSim.js` — measure the heat advection lost each frame
  and give it back weighted by headroom toward the bound (`1 - T` when adding,
  `T` when removing), which is exactly conservative and cannot create a new
  extremum. Mean now holds ~0.489 and flat from frame 4500 on, against
  0.5046 -> 0.6144 before, and contrast *improves* because the field never
  saturates: SD 0.0478 vs 0.0351, S(2cell) 0.203 vs 0.178, for about 1ms a
  frame. The history below is kept because the diagnosis was slow and the
  failed alternative is instructive.

  Interior mean temperature climbed monotonically and never plateaued —
  0.5048 / 0.5249 / 0.5431 / 0.5551 / 0.5705 / 0.5856 / 0.5987 / 0.6089 at
  frames 1500..12000. The plates are symmetric (0 at top, 1 at bottom, equal
  rate) so it should hold 0.5 forever. Eventually the whole field saturated
  hot: a live canvas read after ~10k frames was 95.9% red, 0% blue and **0%
  near-black**, which is the giveaway, since the gradient passes through black
  at T=0.5 and any field with spread about the midpoint must produce black
  pixels. It predates both the SOR and the MAC changes; the 4.4x speed-up only
  made it visible, since at 119fps frame 12000 arrives in under two minutes
  where at 24fps it took eight.

  What is known, from a no-plates run where conservation must be exact:

  | config | drift x1000 over 3000 frames |
  |---|---|
  | no advection at all | **0.00** |
  | nothing moving at all | **0.00** |
  | semi-Lagrangian temp + vel | 1.70 |
  | semi-Lagrangian temp | 1.98 |
  | MacCormack (shipped) | 3.05 |
  | MacCormack, viscosity 0 | 3.59 |
  | MacCormack, diffusionRate 0 | 6.41 |

  So **advection is the source**, diffusion is exactly conservative, and
  projection never touches temperature. It is *not* MacCormack specifically —
  plain semi-Lagrangian drifts too, MacCormack is only ~1.5x worse. Diffusion
  partly masks it, which is why turning it off makes it worse.

  **Not caused by the SOR change, and not by the MAC rewrite**: the pre-session
  Gauss-Seidel config drifts too (0.5003 / 0.5143 / 0.5291), and the collocated
  backup has the same `bind`-clamped backtrace. The speed-up only made it
  *visible* — at 119fps the browser reaches frame 12000 in under two minutes,
  where at 24fps that took eight.

  **The sign is unexplained.** Semi-Lagrangian advection is known to be
  non-conservative, but that alone does not say why the error is consistently
  *positive*. Suspicion is the backtrace clamp at the walls resampling boundary
  values, but this has not been demonstrated — do not write a mechanism into
  this file until it is. Note the plates amplify it roughly 10x over the
  no-plates case, presumably by continuously re-injecting sharp gradients.

  **Flux-form advection was tried, and it does not work here.** Worth reading
  before anyone tries it again, because in principle it is the right fix and in
  practice it destroys the flow.

  The scheme: temperature in flux form `dT/dt + div(uT) = 0` on the faces where
  the MAC velocities already live, second-order upwind face values with a
  monotonized-central slope limiter, unsplit, substepped for Courant, and
  falling back to semi-Lagrangian past a substep cap. Conservation worked
  exactly as advertised — with `regions: []` the drift is **literally 0.000**
  at every checkpoint against MacCormack's 2.3–3.0.

  But with plates the field drifts *down* and the convection dies:

  | variant | mean, frame 1500 -> 9000 | SD | S(2cell) |
  |---|---|---|---|
  | MacCormack | 0.505 -> 0.586 (up) | 0.0735 | 0.199 |
  | flux, iterations 4 | 0.499 -> 0.175 | — | — |
  | flux, iterations 8 | 0.501 -> 0.367 | 0.1270 | 0.109 |
  | flux, iterations 16 | 0.502 -> 0.456 | 0.0527 | 0.089 |

  The renders are a nearly uniform cold blob with a thin warm rind — no plumes,
  no filaments. Two things were ruled out by measurement rather than argument:

  - **Not the operator splitting.** Two 1D sweeps conserved the global sum but
    overshot [0,1] badly (5951 cells) and drifted worse, because a single 1D
    sweep only preserves a uniform field where `du/dx = 0` and only the *total*
    divergence vanishes. Going unsplit fixed the overshoot and changed the
    drift hardly at all.
  - **Not the Courant number.** Tightening the substep threshold from 0.9 to
    0.4 to 0.2 left the drift identical (mean at frame 6000: 0.4733 / 0.4743 /
    0.4756) and made overshoot and detail slightly *worse*, which is the
    opposite of an instability.

  What is left, and fits every observation: **the slope limiter returns zero
  slope at an extremum by construction, so the scheme degenerates to
  first-order upwind exactly at the thermal boundary layer on the plates**,
  which is only a few cells thick at res 256. Smear that layer and no plumes
  detach, so convection starves, the field goes smooth and coasts cold. It also
  explains why more pressure sweeps help a little — they reduce the residual
  `dT = -T * div` source — without ever fixing the real problem.

  A second, separate hazard found on the way: **flux form couples the
  temperature to the projection's convergence** in a way semi-Lagrangian does
  not, because leftover divergence acts directly as a temperature source. Any
  future conservative scheme here inherits that and will want `iterations` well
  above the 4 that SOR otherwise makes sufficient.

  **What shipped instead**, and it works: keep MacCormack, which this project
  already measured as much sharper than the alternatives, and bolt conservation
  on afterwards. `conserveMass()` measures the per-frame mass error and gives
  it back weighted by headroom toward the bound (`1 - T` when adding, `T` when
  removing), so it is exactly conservative and cannot create a new extremum.
  The per-frame error is only ~5e-6 of the mean, so it never has to fix
  anything locally — it just has to stop the secular drift, and it does.

  The lesson worth keeping: **a correction on a sharp non-conservative scheme
  beat a scheme that was conservative by construction**, because what this sim
  needs from advection is a crisp boundary layer, and every genuinely
  conservative method on offer buys its conservation with a limiter that
  flattens exactly that.
- **Unsteadiness is non-monotonic in viscosity** — 0.94 at 1e-4, 0.28 at 3e-5,
  0.34 at 1e-5, 1.05 at 0. The renders agree (3e-5 looks visibly more laminar),
  so the number is real, but the mechanism is unexplained. Textbook
  Rayleigh-Benard does have a conduction -> steady-roll -> oscillatory ->
  turbulent sequence that could account for a dip; unverified.
- **The sim is strongly resolution-dependent.** At vorticity 0, canvas speed
  goes 1.25e-4 -> 4.85e-5 and sharpness 1.135 -> 0.419 from res 128 to 256.
  Physical parameters should be expressed per unit length, not per cell.
- **Multigrid for the pressure solve never converged** — ~1.25x per V-cycle
  instead of ~10x. Tried coarse-RHS scalings of 1, 4 and 0.25; 4 was
  directionally right but far too slow. Probably the piecewise-constant
  prolongation. Not fixed. Note that pressure convergence turned out not to
  matter visually (512 sweeps vs 16 moves the temperature field by ~8e-4), so
  this is a performance idea, not a correctness one.
- ~~SOR does work despite an early measurement suggesting otherwise.~~
  **Closed — SOR is now the shipped pressure solve** (`omega` in `makeSim.js`,
  derived as `2/(1 + sin(pi/N))`). 4 sweeps of it beat 32 Gauss-Seidel sweeps
  on divergence, 1.7e-3 against 4.8e-3, at a quarter of the cost. Two traps
  found while landing it: **warm starting the pressure field is unstable under
  over-relaxation** (fine at omega 1, reaches |p| ~ 1e21 by omega 1.7, so the
  solve still starts from zero every frame), and **subtracting the mean
  pressure is a bit-for-bit no-op** — only the gradient reaches the velocity,
  so the Neumann null-space constant never mattered in the first place.

## Benchmarking notes

Measure in Node against a copy of `makeSim.js` with a `getRaw: () => ({xVel,
yVel})` added; `getTemperatures()` is already exported. Gotchas learned the hard
way:

- Compare at **equal simulated time**, not equal frames, when `dt` varies.
- **Never tie `diffusionRate` to `viscosity`.** A sweep that set
  `diff = visc/10` made "lowering viscosity" look like a 2.4x detail win. It
  had actually cut thermal diffusivity 10x, starved the plates, and stopped
  convection entirely — the field was a black frame with faint noise.
- **Never normalize by a quantity that can vanish.** `S(r)/SD` and
  `nyqV = RMS(grid-scale)/SD(speed)` both explode toward impressive-looking
  numbers when the flow stalls and the denominator goes to zero. Always print
  the denominator (interior SD of T, RMS speed) and gate on a
  "did it actually convect" check, or a dead sim reads as a great result.
- **Check the asymptote, not one operating point.** Collocated and MAC look
  comparable at 16 sweeps (both ~1e-2, dominated by solver residual) and are
  qualitatively different by 1024. The same mistake made SOR look divergent
  earlier in this project.
- Always **look at a render**, not only the metrics. Two separate false
  positives here were caught instantly by looking at the image.
- `mean|grad T|` is a confounded sharpness metric — a blurrier scheme spreads
  buoyancy over more cells and drives a *stronger* flow, which can raise the
  gradient. Use the scale-free `RMS(laplacian T)/SD(T)` instead.
- Run A/B timing in separate processes, alternating order, several trials.
- In-browser timing is meaningless in a backgrounded tab: Chrome throttles rAF
  when `document.visibilityState === "hidden"`. A background tab measured the
  sim at 241ms against a true 13ms — a ~6x penalty, enough to invent an
  imaginary performance problem. To benchmark the live page, neuter
  `requestAnimationFrame` so its loop stops competing, measure, then restore it.
  **Check `document.visibilityState` and `document.hasFocus()` before trusting
  anything read from a tab**, because a hidden tab is throttled to roughly 1Hz
  and so barely advances the simulation at all. A canvas read from one came
  back 98.4% near-black with the startup seed specks still individually
  visible — which looks exactly like a dead or saturated field, i.e. it mimics
  the very bug you might be hunting. A long rAF loop in a hidden tab also just
  hangs until the tool times out.
- **Let the fluid actually convect before measuring anything.** A solver
  comparison run for 90 frames from the uniform initial field produced
  `S(1/128) = 0.0003` and `|p|max = 0.000` for every config — all the quality
  columns were ratios of one near-zero to another, and the whole table had to be
  thrown away. Print interior SD and RMS speed next to every result; a live
  field here is SD ~0.07 and RMS speed ~2e-2. Develop one field once, cache it,
  and inject it into each variant so they are judged on the same flow.
- **Two configs run for 2500 frames are different chaotic realizations**, so
  `S(r)` between them carries real noise — it ran non-monotonically across
  resolutions (0.302 / 0.298 / 0.361 / 0.339 / 0.406 for 192..320). Differences
  under ~20% mean nothing. Compare from a shared snapshot for a fair test.
- Timing varies ~35% run to run within a single process (4.80ms vs 6.50ms for
  identical configs), so treat small timing deltas as noise too.
- **Browser frame times are vsync-quantized**, only ever multiples of 8.33ms on
  a 120Hz display. Bucket the deltas instead of reading a mean; the original
  "41.7ms" reading was exactly 5 vsync intervals, not a measurement of work.
