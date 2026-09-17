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
diffuse(xVel) diffuse(yVel) diffuse(temp)
project()         make the velocity field divergence-free
swapBuffers()
advect()          MacCormack on all three fields
project()
```

Each field has a `Prev` buffer; `swapBuffers` rotates current into previous and
reuses the old previous as the new destination, so buffers are always fully
overwritten before being read again. `pressure`, `divergence` and `reverted` are
dedicated scratch — do not alias them back onto the `Prev` buffers, which is
what the code originally did and which made it look like projection consumed
last frame's velocity.

Indexing is `ix(x, y) = x + res * y`, so **`i` (x) is the contiguous axis**.

## Invariants and gotchas

- **Loop order is `j` outer, `i` inner, everywhere.** Not just a preference:
  iterating the other way strides `res` floats per read and misses cache. For
  Gauss-Seidel the two orders produce the *bit-identical* iterate (either way
  the already-updated neighbors are exactly `(i-1,j)` and `(i,j-1)`), so this is
  a pure 1.22x win — verified at 0.00e+0 difference at 1/2/5/20 sweeps.
- **`canvasPerFrame() = dt * N / res` is the single unit conversion.** Advection
  moves fluid `dt * N` cells per frame, so one unit of stored velocity is that
  fraction of the canvas per frame. `getVel` multiplies by it, `addVelocity`
  divides by it. Anything crossing the sim/screen boundary goes through this one
  factor. The old `getVel` scaled by `1/(2·dt²·N)`, which made the particle
  speed wrong by 39.7x at `dt=0.01` and 0.044x at `dt=0.3`.
- **`setBoundaries` sign multipliers**: `xVel` is `(-1, 1)`, `yVel` is `(1, -1)`,
  scalars (`temp`, `pressure`) are `(1, 1)`. Getting these backwards gives slip
  walls that quietly leak momentum.
- **`sweepsFor(a)`** caps diffusion sweeps by its actual convergence rate
  (`4a/(1+4a)` per sweep) instead of spending the full `iterations` budget.
  Weak diffusion converges to float precision in a handful of sweeps. Pressure
  has ratio 1 and genuinely needs every sweep, which is why `project` asks for
  the full budget. **Viscosity 0 short-circuits to zero sweeps**, which is why
  dropping viscosity nearly halves frame time (5.2ms -> 2.9ms).
- `divergence` deliberately gets no `setBoundaries`: `linearSolve` reads
  `arrPrev` only at interior cells.
- `applyRegions` relaxes toward a target rather than accumulating, so sources
  cannot run away, and the field stays inside the range spanned by the targets
  and `startingTemperature`.

## Measured performance (res 128, Node, this machine)

| change | before | after |
|---|---|---|
| loop-order swap | 10.75ms | 8.80ms |
| `iterations` 32 -> 16 | 11.37ms | 7.94ms |
| viscosity 1e-4 -> 0 | 5.2ms | 2.9ms |

The pressure solve is ~6.4ms of an 11.4ms frame (`project` runs twice).
Resolution headroom: res 192 ~9.0ms, res 256 ~16.8ms (sim only).

`iterations: 16` rather than 8 because residual velocity divergence — the metric
that governs particle artifacts — is 0.33% / 0.65% / 1.27% at 32 / 16 / 8.

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

**The view window is narrower than the temperature range, deliberately.** The
plates are pinned at 0 and 1, but the convecting interior is tightly clustered
around `startingTemperature` — measured percentiles are 1% 0.373, 10% 0.420,
50% 0.520, 90% 0.588, 99% 0.677. Mapping the full 0..1 renders 38.5% of the
frame near-black; `view = {minTemp: 0.3, maxTemp: 0.7}` cuts that to 15.8% and
what it clips is essentially only the plate rows. Re-measure this band if the
buoyancy or plate targets change — it does not transfer.

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

## Open questions

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
- SOR does work despite an early measurement suggesting otherwise — that sweep
  was taken before the transient over-relaxation ringing died down. At 2000
  sweeps, ω=1.9 gives residual 7.38e-3 vs ω=1.0's 1.22e-1.

## Benchmarking notes

Measure in Node against a copy of `makeSim.js` with a `getRaw: () => ({xVel,
yVel})` added; `getTemperatures()` is already exported. Gotchas learned the hard
way:

- Compare at **equal simulated time**, not equal frames, when `dt` varies.
- `mean|grad T|` is a confounded sharpness metric — a blurrier scheme spreads
  buoyancy over more cells and drives a *stronger* flow, which can raise the
  gradient. Use the scale-free `RMS(laplacian T)/SD(T)` instead.
- Run A/B timing in separate processes, alternating order, several trials.
- In-browser timing is meaningless in a backgrounded tab: Chrome throttles rAF
  when `document.visibilityState === "hidden"`.
