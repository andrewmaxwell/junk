# soundViz

Hold anywhere to record from the microphone; on release the sound is drawn
full-screen as a **reassigned spectrogram**. Scroll or pinch to zoom in on any
part of it, drag to pan once you are in, tap a point to read off what is
there, `P` to hear the part you are looking at, `S` to save it as a large PNG.
Served from
`http://localhost:3000/soundViz/`. No build step, no dependencies — plain ES
modules loaded by `index.html`.

The look being chased is the MATLAB spectrograms from Mythbusters: fine bright
filaments on black, not fuzzy blobs.

## Priorities

Andrew's stated order: **detail and aesthetics first, UI responsiveness second.**
Spending a second of analysis to make the picture better is the right trade
here. Do not quietly optimise for frame rate at the cost of image quality.

The second standing requirement, from the same conversation: **the picture must
not change when you zoom.** Zooming may add detail; it may not restate the
picture in different terms. Several things below exist only to hold that line.

**The target is one machine: Andrew's M4 MacBook Pro.** He tried it on a phone,
it crashed during analysis every time, and his answer was to stop caring —
"remove anything specifically for mobile and turn up the knobs for maximum
quality". So the budgets below are sized for ~16 GB of unified memory and a
GPU that will take a one-gigabyte vertex buffer, and **a phone is expected to
crash**. Do not quietly lower them to make some other device work; that is
undoing the decision, not fixing a bug. The touch handling in `zoom.js` and
`index.html` stays because it costs nothing and a trackpad uses some of it.

## Files

| file | role |
|---|---|
| `index.html` | canvas, hint/status chrome, readout tooltip, touch CSS |
| `main.js` | recording state machine, gesture wiring, PNG save, status text |
| `recorder.js` | persistent mic, ring buffer, take start/end |
| `capture-processor.js` | AudioWorklet, posts raw blocks to the main thread |
| `playback.js` | clips a viewport back to audio: time slice + STFT band filter |
| `reassign.js` | the analysis: STFT → cloud of reassigned cells, one region of it |
| `analysis-worker.js` | one of a pool of threads; owns a copy of the take and runs regions |
| `ridge.js` | one coarse pass per recording: how far each ridge actually runs |
| `fft.js` | iterative radix-2 complex FFT |
| `render.js` | picks the sampling grid, drives `reassign` → `glview`, tiles the export |
| `glview.js` | WebGL2 renderer: accumulate → measure background → colour → per-pixel readback |
| `zoom.js` | viewport model (samples × Hz), gesture handling, hold-vs-drag |

Dependency direction: `main → {recorder, render, zoom, playback}`, `render →
{ridge, glview}` and, across a worker boundary, `analysis-worker`;
`analysis-worker → {reassign, ridge}`, `reassign → {fft, ridge}`, `ridge →
fft`, `playback → fft`. Nothing else imports anything. Note what `render.js`
does *not* import any more: `reassign.js` runs only inside a worker, and the
one thing `render.js` still needs from `ridge.js` is `REACH` — the one distance
both files ask corroboration over, and letting those two numbers drift apart
would mean two different scales claiming to be the same measurement.
`playback` is handed the `AudioContext` rather than reaching for it, which is
what keeps it off `recorder`.

## What a single drawn segment means

This is the thing to understand before changing anything. Each segment is **one
cell of the STFT** — one (frame, frequency-bin) pair. There are millions.

- **x** = `t̂`, the *reassigned* time. Not the centre of the analysis window: the
  phase of the transform says where inside that window the energy actually sat.
  Sub-sample precision.
- **y** = `f̂`, the *reassigned* frequency, on a log axis. Not the bin centre —
  again recovered from phase. This is why a tone draws as a hairline rather than
  a fat band: every bin of its main lobe collapses onto the same `f̂`.
- **angle** = the local **chirp rate** `∂f/∂t`, measured. Horizontal is a steady
  tone, vertical is a click (all frequencies at one instant), diagonal is a
  glide. Derivation below.
- **coherence** = how much the neighbouring estimates corroborate this cell
  *and* how far the ridge it sits on actually runs, 0..1. Measured, not styled
  — derivation below. It decides how much stroke a cell earns and how vivid it
  draws, which is what keeps the interference residue from posing as signal.
- **length** = **nothing about the signal.** It is the on-screen distance to
  where the neighbouring cell falls — scaled by coherence, so only a
  corroborated direction bridges the gap and an ambiguous cell stays a point.
  A drawing decision, not a measurement.
- **brightness** = accumulated power in that pixel, in dB, relative to the
  background level of that frequency band, through a monotonic-brightness ramp.
  So brightness *is* amplitude — but amplitude relative to the recording's own
  noise floor, not absolute.
- **hue lean** = mean chirp rate of the coherent energy in the pixel: rising
  sweeps lean the ramp's colour towards blue, falling towards yellow, steady
  tones and clicks stay put. **Saturation** = mean coherence: dust greys out.
  Both are deliberately mild — brightness stays the thing colour reads as.

## The mathematics

**Reassignment.** An ordinary spectrogram discards phase and draws each cell at
the centre of whatever bin it landed in. The phase knows better. With the Hann
window `w`, the time-ramped window `tw[n] = (n − centre)·w[n]`, and the window
derivative `dw[n] = (π/N)·sin(2πn/N)`:

```
t̂ = frame centre + Re{X_tw / X}          (samples)
f̂ = bin centre   − Im{X_dw / X}·sr/2π    (Hz)
```

**Chirp rate, for free.** For a signal that is locally a linear chirp of rate q,

```
X_dw/X = −i(ωi − ω) − i·q·(X_tw/X)
```

The first term is purely imaginary, so taking real parts leaves
`Re{X_dw/X} = q · Im{X_tw/X}`. Both quantities are already in hand — **the ridge
direction costs no extra transform.**

`reassign.js` stores the *pair* as an angle, never the ratio: a steady tone has
zero rise, a click has zero run, and `q = rise/run` blows up on one or the
other. As a direction vector both cases are finite and no regularisation is
needed anywhere.

Verified numerically: a 300→8000 Hz chirp recovers as 0.160416 Hz/sample against
a true 0.160417; a steady tone gives exactly 0; an impulse gives 90° at every
bin and every offset from the window centre.

**Coherence.** A real one-dimensional structure is measured many times over —
every bin its lobe spreads across, every frame whose window covers it — and all
of those estimates land on the same ridge: the displacement from one to the
next lies *along* the direction the cell itself measured. Each cell is
therefore asked whether two neighbours corroborate it, and the perpendicular
residual (in units of `winLen/4` samples × one unpadded bin), through a
Gaussian of width `COHERENCE_SIGMA`, is the coherence.

One neighbour is not enough, and this was measured before it was believed. The
neighbouring *bin* alone convicts noise and window sidelobes but acquits the
looping filaments reassignment hangs between two components sharing a window —
the loops are locally smooth, so along frequency they corroborate each other
(power-weighted conf ≈ 0.83, barely below a real ridge). The neighbouring
*instant* is what convicts them: the loop wanders off the measured direction as
time advances. Coherence takes the worse of the two residuals, and the best of
each pair of sides, so a cell at the edge of a lobe or at an onset is not
convicted by its one empty flank. Power-weighted means, measured on synthetic
signals (`conftest.mjs`-style, recreate in the scratchpad as needed): clean
tone / chirp / click ≈ 1.0 / 0.96 / 0.96; two-component loops 0.38 (their own
ridges keep 0.61); white noise 0.33; sidelobes 0.17–0.24.

Both comparisons are pinned to *absolute* distances so no pass can recolour
cells another pass emitted — the same nesting guarantee the positions have.
Along frequency the neighbour is one **unpadded** bin away (padding leaves
those bins where they were); along time it is `REACH = 64` samples away
whatever the hop, which is why frames pass through a ring and are emitted
`D = 64/hop` frames behind the analysis.

**Ridge support** (`ridge.js`), the thing two neighbours cannot tell you. The
reassignment field of white noise is smooth over roughly one analysis window,
so its most coherent tail passes the test above as convincingly as a partial
does — that is a ceiling on *any* per-cell test, and it was what still chained
into faint filaments at deep zoom. What separates the two is not how well a
cell agrees with its neighbours but **how far the agreement keeps going**:
noise runs out after about a window, structure does not.

So a second, much cheaper pass walks the chains. On a grid of its own —
`REACH` samples apart, no zero padding — each cell is linked to its neighbour
in time and its neighbour in frequency wherever the step lies along the
direction *both* ends measured, and the length of the whole maximal chain
through every cell is recorded. Lengths are converted into **resolution cells**
(one window of time, one Hann main lobe of frequency) so the two axes can be
compared at all, the larger of the two wins, and a smoothstep from
`SUPPORT_LO` to `SUPPORT_HI` turns that into a 0..1 gate. `reassign.js`
multiplies it into the coherence it emits: corroborated by its neighbours *and*
part of something that lasts.

Both axes are needed and neither alone would do. A steady tone chains along
time forever but only across its own lobe in frequency; a **click chains across
thousands of bins and barely more than one window in time** — a time-only test
would convict every transient in the picture. Power-weighted mean gate,
measured on synthetic signals: tone / chirp / click / two close tones all 1.00,
speech 0.96, white noise 0.12 on a 1.5 s take (0.26 on a 0.3 s one, where the
open-ended rule below has proportionally more of the recording to forgive). In
terms of what that does to the drawing, the power-weighted mean of
`smoothstep(0.15, 0.6, conf)` — how much stroke a cell earns — goes 0.86 → 0.85
for speech and 0.40 → 0.03 for white noise.

On the real thing, driven over CDP against a synthetic mic, that lands where it
was aimed and nowhere else. A recording of **white noise at 116×** went from
mean luma 4.95 to 0.63, from 4.5% of pixels lit to 0.6%, and its 99th
percentile from 157 to 0: the bright green spine that view used to draw — pure
noise, elongated and saturated into something that looked like a partial — is
gone, and what is left reads as the faint stipple it always was. The **quiet
high band of a speech take at 116×** went 2.29 → 0.96 mean and 4.5% → 1.3% lit
*while its 99.9th percentile did not move at all* (222.7 → 222.7): the dust
went, the filaments stayed. And the **full view is essentially untouched**
(84.6 → 83.2 mean), which is right — there the cells are sub-pixel dense and
stroke length hardly matters.

Three properties make it hold the zoom invariant, and they are the reason it is
shaped this way rather than as a chain walked inside `reassign.js`:

- **One grid for the whole recording, computed once**, like the exposure. A map
  rebuilt per viewport would be asking, at 100×, whether ridges persist across
  a span a few hundred samples wide — where nothing does, including real
  partials.
- **Indexed by absolute instant and by the unpadded bins every pass shares.** A
  cell at padded bin `b` reads `b/pad`, so the same cell asks the same question
  however finely it was analysed. Verified: re-emitting a cloud at half the hop
  and twice the padding reproduced the support of **100%** of cells, exactly.
- **A chain reaching the first or last frame counts as unbroken**, not as
  ended. A partial still sounding when the take stopped did not stop, and this
  is the same rule coherence already uses when a neighbour is missing. Without
  it the first and last ~140 ms of every recording would fade. The credit has
  to be given only where there was a cell to credit, though: handing it out
  unconditionally at the far end awarded full support to every bin of the last
  frame, which in a recording of pure silence was the only thing in the map.

The coarse hop cannot be widened to make long takes cheaper, and this was
measured rather than assumed: at 128 samples speech's mean gate falls 0.94 →
0.72 and at 512 to 0.32, because vibrato moves a harmonic off its own measured
direction between frames that far apart. Noise falls too, but there is nothing
left to win there.

**FFT packing.** `w` and `tw` are packed into one complex transform (real into
`re`, real into `im`) and unpacked per bin via Hermitian symmetry; `dw` needs a
second. Two transforms per frame, not three. Validated to 1.9e-6.

## How zooming works, and why it looks the way it does

There is no fixed master image. The **cloud of cells is the master** — it is
resolution-independent, so a viewport is projected exactly rather than
interpolated. That is strictly better than any raster could be: a raster large
enough for 100× zoom would be hundreds of gigapixels.

Detail is quadratic in zoom, though. Holding both gaps sub-pixel at zoom Z costs
Z² times the cells of a full view, so no single pass can serve every zoom. The
compromise, in three parts:

**One pass covers the whole recording whenever the budget allows it.** On a
~1 s take that holds out to about 2×: panning and zooming inside that recompute
nothing at all. Past it the analysed span shrinks to the viewport and a gesture
triggers a second pass, 400 ms after it stops (`zoom.js`), costing 0.7–1.4 s of
blocked main thread.

**A second pass has to earn its keep.** `analyze()` skips outright unless the
cloud in hand fails to reach across the viewport, or the new grid would close
the gaps by at least `WORTH_REDOING`. Before this guard a nine-notch scroll
fired five separate analyses, 5.4 s of freeze; after it, one, 1.4 s.

Two traps in writing that test, both of which cost real detail before they were
caught. The gaps have to be evaluated *at the viewport being asked for* —
comparing against a figure stored from the viewport a grid was planned for is
meaningless, because zooming scales every gap. And the two gaps have to be
compared *separately*, either one closing being enough: deep into a zoom the
frequency gap is pinned at whatever the FFT cap allows and swamps a
`max(gapT, gapF)` comparison, hiding the fourfold gain in time that is the whole
reason the ridges join up down there. With that wrong, the 116× view lost two
thirds of its cells (778 KB of screenshot down to 232 KB) while looking, from
the console, like it was working.

**The grids nest.** The hop is quantised to a power of two and the first frame
anchored to an absolute multiple of it; `fftSize` is `winLen` times a power of
two, and zero-padding leaves the coarser grid's bins exactly where they were
(`X_2N[2k] = X_N[k]`). So a finer pass is a strict *superset* of the coarser
one: it adds cells at new positions and never moves the ones on screen.

**The exposure is measured once.** `view.calibrate()` runs on the full span
after the first analysis of a recording and is then left alone.

**So is the ridge map.** `buildRidge()` runs on the whole recording on the
first analysis and every later pass reads it, for the same reason and with the
same effect. Its lookup is by absolute instant and unpadded bin, so a re-emitted
cell gets back the number it already had.

Together these mean a second pass reads as detail arriving, not as a different
picture.

## Where the analysis runs

Nothing expensive happens on the main thread any more. `render.js` picks the
grid and then hands the work to a pool of `analysis-worker.js` threads, each
holding its own copy of the recording and of the ridge map; the main thread's
share of a pass is the GL upload at the end of it. Blocked main thread went
from 4–10 s to 0.04–1.3 s (table under Testing), and the page answers gestures
throughout — you can pan while the pass you triggered is still running, and the
picture you are panning is the one that was already there.

**A pass is cut into regions, one message each.** Region *i* is responsible for
emitting frames `[frame0, frame1)`, and it computes `D` frames beyond each of
its ends so that its cells meet exactly the neighbours a single call would have
given them. `a0`/`a1` clip that to the grid, which is the whole point: a
neighbour is missing only where the grid itself runs out, so the "a missing side
abstains" rule fires at the ends of the recording and nowhere else, and a region
boundary is invisible. Verified rather than assumed — splitting into 2, 3, 5, 8
and 16 regions is **bit-identical** to one call, at every hop including 1, where
`D` is the whole of `REACH`.

**How many regions**, in `regionsFor()`. The overlap is a constant per region
rather than a share of it, so cutting finer always shortens a *round* — but the
seventeenth region of a pool of eight waits for a second round that costs as
much again. So the estimate is one region's cost times the number of rounds,
and the count that minimises it wins. It comes out at the pool size nearly
everywhere and drops below only at the deepest zooms, where the hop is 1, `D` is
64, and the grid is three hundred frames wide. Even there the overlap is worth
paying: at 256× the pass went 5.4 s at one region to 2.7 s at eight, while
recomputing four times as many transforms as it emitted.

**A pass is staged whole and lands in one piece.** A worker fills its whole
region into one `Float32Array` and transfers it at the end; the main thread does
`begin` → one `pushAt` per region → `end` in a single task. Streaming cells as
they were computed would be cheaper to write and wrong to look at: the cloud in
the GL buffer *is* what is on screen, so writing over it progressively means
drawing half of a new picture on top of half of an old one. There is no second
buffer to stage into — the first one is already a gigabyte.

**Every region reserves the stretch its frames would fill at their widest**, one
cell per bin, so it knows where its cells belong without hearing how many its
neighbours produced. That leaves gaps, wherever a bin held nothing or fell
outside the audible band, and the gaps are simply never drawn: `glview.js`'s
`slice()` returns one contiguous run *per region* instead of one overall, which
is a handful of draw calls rather than one.

**Passes are discarded, not cancelled.** A worker inside a region cannot be
interrupted — that would need a `SharedArrayBuffer` to poll, and the page is not
cross-origin isolated — so a superseded pass runs to completion and its result
is dropped on a generation check. The cost is that a second gesture during a
pass waits for the first pass to finish first. Two things keep that from
mattering: `zoom.js` only fires one pass per gesture burst (the settle timer
restarts on every notch), and the pass is now short enough that the wait is
noticed as slowness rather than as a freeze. Terminating and respawning the pool
was considered and is the fallback if this ever does become the complaint; it
costs re-sending the take and the ridge map to every worker.

**The `WORTH_REDOING` guard has to ask about the pass in flight**, not only
about the cloud in hand — `wanted || current`. Asking only about the cloud in
hand would start a second identical pass behind the first, because the first has
not landed yet.

## Decisions that were expensive to learn

Each of these was a visible bug first. Do not undo them without reading why.

**A cell's power must not depend on the hop.** `scale` divides out only the
padding factor `fftSize/winLen`, because padding spreads a partial's main lobe
over that many more bins which all reassign onto the same ridge. It must *not*
divide by frame density: halving the hop doubles the cells along a ridge but
also halves the gap between them, and the renderer already divides by how many
strokes cover a pixel. Dividing again made the picture fade every time it was
sampled more finely — measured at the same viewport, mean luminance fell 46→35
at 12× and 26→12 at 40× when a settle pass landed. With the hop term removed:
44→46 and 27→34, the rise being detail that was not there before. **This was the
main cause of "the image changes when I zoom".**

**The background is measured once, over the whole recording.** It used to be
remeasured per viewport, and the estimator asks "how faint is the faint end of
what is on screen" — at 100× that has nothing to do with the recording's noise
floor. Measured: the per-band background ran −113…−54 dB at full view and
−25…−20 dB at 116×, a 40 dB swing that showed up as the colours lurching.

**The analysis window duration is fixed (`WIN_MS = 25`).** It was once
`0.02 × visible span`, so zooming shrank the window from 1024 samples to 128 —
375 Hz resolution, everything reading as impulsive. Every zoom level was a
*different analysis* rather than a closer look at one.

**Strokes are instanced quads, not point sprites.** A sprite is square, so a
long stroke pays the fill of its whole bounding box, it is capped by
`ALIASED_POINT_SIZE_RANGE`, and — the one that forced the change — it is
discarded whole once its centre leaves the viewport. That needed an oversized
accumulation buffer to keep the screen edges honest, and it would have torn the
export apart at every tile boundary. A quad costs its own area, clips instead of
vanishing, and has no size ceiling. Full-view draw went 53 → 93 ms and deep zoom
stayed where it was (6 → 5 ms at 100×); the margin and the stroke-length cap
both went away, and the export tiles meet with no seam.

**Stroke length is the on-screen gap to the neighbouring cell.** A constant
pixel length breaks into confetti as soon as the gap outgrows it. The gap is
computed per-cell in the vertex shader from the analysis hop (along time) and
bin spacing (along frequency), blended by the ridge direction.

**Only coherence earns stroke length.** The gap is scaled by
`smoothstep(0.15, 0.6, conf)`, and on top of that only near-perfect coherence
may draw a genuinely long stroke — the cap climbs *geometrically* from 3 px at
conf 0.6 to the cost bound at conf 1 (`pow(conf, 8)` in the exponent). A
middling direction drawn across a large gap is a comb tooth lying across the
curve the eye follows; before this gate the deep zoom was solid spaghetti.
Width is also nudged, 1.25–1.6 px across the conf range, so strong structure
reads crisp while the residue stays fine-grained.

**Ridge support gates coherence, never power.** Brightness is amplitude and
must stay amplitude, so a cell that turns out to sit on nothing keeps every bit
of its energy — it loses its stroke length, its extra width and its say in the
hue, and nothing else. The consequence is worth expecting rather than being
surprised by: noise does not vanish, it stops pretending. The same energy that
used to be smeared along a confident-looking filament now lands as speckle,
because `coverage` is only ever divided out and a stroke that shortens to a
point concentrates what it was carrying. That is the honest picture of a noise
floor, and it is what the deep-zoom numbers above are describing.

**Everything is drawn as dots at depth because the gap outgrows the cap, not
because of anything coherence does.** Worth knowing how this was established,
because the obvious suspect was wrong. Replaying the vertex shader's own length
decision over a real cloud (a scratchpad script; rebuild it as needed) gives,
per cell, whether `MIN_HALF`, `bridge` or `longCap` is what bound it, and what
fraction of its gap it covers. At 116× before the padding was raised: mean fill
0.54, and **`longCap` binding on 48% of cells** — with `gapF` at 47 px against
`gapT` at 7. Running the same thing with the ridge gate switched off changed
none of it (fill 0.542 vs 0.541, dots 16.2% vs 16.4%), so the ridge map is not
what made the picture dotty; the frequency gap is, and it always was.

**So the answer to "more detail" was more padding, not longer strokes.** Both
close the gap, but only one of them measures anything: a longer stroke is an
extrapolation along one cell's own direction estimate, while more padding
samples the same reassignment field at more points, each placed by its own
phase, nesting exactly with the coarser grid. Relaxing `pow(conf, 8)` in
`longCap` did test better in isolation (mean fill 0.556 → 0.667 at 116×), but
once the padding was raised the two were visually indistinguishable at 116× and
256×, because the cells are close enough together that the cap rarely binds.
The guard stays as it is — it is the thing that stops a middling direction
being drawn as a comb tooth across a large gap, and nothing here has made that
failure less real.

**Zero padding is most of the FFT, and it is free to skip.** Every analysis
frame is `winLen` samples of signal in an `fftSize` transform, so all but the
first `1/pad` of the input is zero. After the bit-reversal permutation the
non-zero entries sit at multiples of `pad`, one per aligned block, and every
butterfly stage below `size = 2·pad` combines a value with a zero: those
log2(pad) stages are not arithmetic at all, they are a *broadcast* of each value
across its own block. `FFT.transform(re, im, nz)` does that instead, and the
result is **bit-identical** to the full path (verified at eight sizes) because
`a - 0` and `a + 0` are exactly `a`. It also saves the caller zeroing the tail,
which is the larger part of the array. Measured per frame: 1.40× at the full
view's `fftSize` 8192, 2.00× at 65536, **2.34× at the 262144 the deepest zooms
use** — which is exactly where it was needed, since padding is what closes the
frequency gap and the deep passes are the slow ones.

**`Math.hypot` and `Math.exp` were costing a third of a second each, per pass.**
Both are called once per cell and there are tens of millions of cells. `hypot`
guards against an overflow these values cannot reach and costs 8.1 ns against
0.64 for `Math.sqrt(x*x + y*y)`; the coherence Gaussian costs 4.7 ns against
0.96 for a 2048-entry table and a lerp. The table is a table rather than an
approximation on purpose: a re-emitted cell has to get back the coherence it
already had, and a lookup is as deterministic as the exponential was. Its
maximum error is 5e-7, which is what the whole change costs — cell for cell
against the old code, `t`, `f`, power and angle come out **bit-identical** and
coherence moves by at most 5.4e-7. On screen that is 0.001–0.002% of pixels
differing by one or two levels at every zoom.

`Math.atan2` is the one that got away: 16.8 ns a cell, a full second a pass, and
it stayed. Storing the direction as a half-angle tangent instead would remove it
and cost nothing in memory, but it changes the cell format and the vertex
shader, and the polynomial approximations that keep the format are only 27%
faster for a 3e-5 error. Not worth it against a cost the pool already divides by
eight. Recycling the workers' output buffers was also tried and abandoned:
allocation of a 116 MB `Float32Array` measures 0.1 ms, because it is lazily
mapped and only the pages actually written cost anything.

**The buffer has to be orphaned, and skipping that is not an optimisation.**
`begin()` calls `bufferData` on every pass even when the size has not changed,
which looks wasteful and is not: it hands the old storage back and gets fresh
memory, so the `bufferSubData` calls that follow do not have to wait for
whatever draw calls are still reading the buffer. Keeping the allocation when
the size was unchanged was tried, on the reasoning that reallocating a gigabyte
must cost something. It costs 0–180 ms, only the pages actually written cost
anything at all, and doing without it turned a commit landing in the middle of
a drag — sixty frames of draws queued against the same buffer — into a **2.2 s**
block instead of 65 ms, in about a third of runs. Orphaning costs 100–300 ms
more per commit and makes every commit the same as every other, which is the
trade worth having.

**The accumulation buffer remembers what it holds.** The first analysis of a
recording used to draw the whole cloud twice over the same full view — once so
`measureBackground` could read the exposure off it, once to show it — which at
this size is most of a second of GPU time for a second copy of a picture already
in hand. `accumFor` records the viewport the buffer was filled for and anything
that would change what an accumulation produces clears it: a new cloud, a
resize, an export tile (whose stroke lengths are measured against a different
height).

**Hue must not come from the raw ridge angle.** `tan(angle)` is the chirp rate
in Hz per sample, and audible sweeps are *tiny* in that unit — a 4000 Hz/s
sweep sits at ~5°, so any linear or doubled-angle mapping leaves every sweep
untinted. The drive is `sin(2·atan(q/Q))` evaluated at two scales
(`HUE_Q1 = 200`, `HUE_Q2 = 6000` Hz/s, averaged), which covers slow glides and
fast sweeps, and goes to zero for both steady tones (q → 0) and clicks
(q → ∞) — a click must not get a random tint from the sign of ±∞. The axial
ambiguity of the stored direction cancels in the sin·cos product form.

**The accumulation buffer's spare channels carry the new dimensions.** R is
power as ever; G accumulates power·conf·drive, A accumulates power·conf, and
the present pass recovers per-pixel means from the ratios. Costs no extra
memory — the RGBA target was already there — but the accumulation clear must
be `(0,0,0,0)` now: alpha is data.

**Coverage is only ever divided out, never multiplied in.** `coverage =
max(profileIntegral/gap, 1)`, where the numerator is the integral of the
fragment shader's end profile (the ends fade by `smoothstep` over
`clamp(half·0.5, 0.5, 2)` px — longer strokes get a longer, softer tail — and
the vertex shader computes the matching integral, `2·half − fade + 0.5`, so
the two never drift apart). Past the point where neighbouring strokes stop
touching, scaling up what is left would make a ridge *brighten* as it fell
apart.

**The FFT cap is a detail knob, and the coherence ring is what stops it.**
`plan()` can always spend frames to close the time gap, but the bin gap is set
by the padding alone, so past ~24× it is the frequency gap that gets stuck at
whatever `MAX_FFT` allows — 47 px at 116×, 179 px at 256×, against a time gap
of 7 and 16. Raising the cap eightfold costs almost nothing, because a pass is
bounded by `MAX_CELLS` and the transform cost grows only with the *log* of
`fftSize`: measured in the browser, the deepest settle went 2.03 s → 2.39 s,
and the first analysis, the full view and 24× did not move at all.

What it does cost is the ring in `reassign.js`, which holds `2·D+1` frames of
`bins` cells so the coherence test can reach REACH samples either side. `D`
grows as the hop shrinks, so the deepest zoom is exactly where the product
explodes — at hop 1 and the new maximum padding it would have been 355 MB of
`Float32Array` per pass, on a page already holding a 320 MB GPU buffer.
`MAX_RING_CELLS` pushes such grids to a coarser hop until the ring fits, which
is the same trade the cell budget already makes, and it is set at the size the
old cap already reached — so the padding got eight times finer for no extra
memory at all.

**The budget is split to equalise the two gaps.** Cells land in a grid `frames`
wide by `bins` tall and the product is fixed, so the only question is the aspect
ratio. All time and the harmonics come out as rows of dashes; all padding and
the ridges break up along their length. `plan()` samples time as finely as
`TARGET_GAP` (0.6 px) asks for, spends what is left on padding, and picks the
pad that minimises the larger of the two gaps. The old rule was time-first with
leftovers to padding, and at full view its leftover branch never fired — which
is what made the full view look like confetti below ~1 kHz, where log-axis bin
spacing is widest. It fired readily when zoomed in, so the padding jumped as
soon as you moved, which is another thing that made the picture restate itself.

**Only the visible stretch of the cloud is drawn.** `analyzeCells` returns
`starts`, the buffer offset of each frame, and a frame's cells all lie within
half a window of its centre — so the visible cells are one contiguous range per
region of the pass.
Drawing 16 M cells at full view costs 93 ms; at 100× it costs 5 ms, because
99% of them are never submitted. Without this a cloud this size would be
unpannable.

**Empty pixels are not quiet pixels.** The background percentile ignores
unsampled pixels; `MIN_SAMPLED` guards bands with too little to measure.

**The colour ramp climbs monotonically in brightness.** MATLAB `jet` runs bright
at cyan, dim at blue-green, bright again at yellow, so a filament of constant
strength appears to break into beads. This single change did more for the
Mythbusters look than any signal processing.

**The status line never goes away once there is a recording.** It used to
blank itself at full view, on the reasoning that `1x` says nothing. It says
plenty: how long the take was and what band is on screen, which are the numbers
every other reading is relative to, and a blank corner is not obviously "you are
looking at all of it" rather than "nothing is loaded". Andrew asked for it to
stay; `showZoom()` now returns early only when there is no recording at all, or
when playback has borrowed the line to describe what you are hearing.

**The spinner is the only thing that says a pass is running**, now that a pass
does not announce itself by freezing the page. It sits with the readout rather
than at the far end of the row — the numbers beside it are what is about to get
sharper — and it is a `transform` keyframe animation, so the compositor keeps it
turning through whatever the main thread is doing. `render.js` counts passes in
flight rather than tracking a boolean, because two can overlap: a superseded one
still has to finish before its result is thrown away.

**Do not put anything the app needs behind `requestAnimationFrame`.** The
status line is painted before the analysis blocks by deferring through a timer,
and it was a frame callback first — but a backgrounded tab fires no frame
callbacks at all, so a take made just before switching away sat unanalysed at
"analysing…" until you came back. This bit the CDP harness before it could bite
Andrew, because an occluded window is backgrounded too.

**A tap reads the picture back rather than recomputing it.** Clicking a point
asks the accumulation buffer what it actually holds there — amplitude above
the recording's own background, mean coherence, mean sweep drive — the same
three quantities already on screen as brightness, saturation and hue. Nothing
is re-analysed: `glview.js`'s `sampleCell(u, v, f)` renders one texel of
`accum` into a dedicated 1×1 `RGBA32F` target and reads that back, rather than
`readPixels`-ing `accum` directly, because `accum` itself may be `RGBA16F`
(`canBlend32` false) and reading a half-float framebuffer back as `FLOAT` is
not something every implementation is asked to support.

Three things follow from reading the buffer rather than the cloud. An empty
pixel reports "nothing here" rather than a fabricated floor — the same
distinction `measureBackground` already makes. The reported chirp value is a
*lean*, not a rate in Hz/s: it is `accum`'s coherence-weighted mean of
`vDrive` over however many cells landed on that pixel, the identical quantity
the hue channel already visualises, and it does not invert back to a
per-partial measurement. True per-cell phase is gone by this point regardless
— reassignment consumes it to produce `t̂`/`f̂` and never stores it, so a
literal "phase at this point" was never on the table.

And the lean is withheld below `SWEEP_MIN_CONF`. The drive is a ratio whose
denominator is the coherent power on the pixel, so as coherence falls it
becomes a confident-looking number derived from almost nothing — a pixel
measured at 5% coherence was happily reporting "falling 47%". The picture
never made that claim, because it rotates hue by `drive * conf` and so shows
no tint there at all; the readout now agrees with it and says "not
corroborated" instead.

**The readout is reachable at every zoom, including full view.** Only two
questions gate a press, and they are deliberately not the same one:
`hasPicture()` decides whether the press waits `HOLD_MS` (so a tap can mean
something), and `canPan()` decides whether the gesture code arms a drag. A tap
reads the picture wherever you are; only a zoomed-in view has anywhere to pan
to. `canPan` implies `hasPicture`, so the gesture code can never arm a drag on
a press `main.js` chose to record immediately — that implication is the whole
consistency argument, and it is why the two predicates may differ safely.

Escape backs out one layer at a time, outermost first — the sound, then the
readout, then the zoom — because each is something you would want to leave
without losing the one under it. Dismissing the tooltip must not also throw
away the view it was opened from.

**Playing a viewport is a time slice and a brick-wall filter.** The picture is
a rectangle in time and frequency, so hearing it means clipping both. Time is a
slice of the samples; frequency is an overlap-add STFT filter that zeros every
bin outside the band — no practical cascade of biquads has a skirt steep enough
for a band that can be a fraction of a hertz wide. Measured on white noise
through the real path: >100 dB out-of-band rejection, and a 40 Hz band
separates partials 60 Hz apart by 52 dB. Worst case cost is 46 ms (a narrow
band across a 5 s recording), one-off on the keypress.

`fft.js` only transforms forwards, so the inverse comes from it by conjugation
(`ifft(X) = conj(fft(conj(X)))/N`) rather than growing an inverse the rest of
the app would never call. Synthesis divides by the summed square of the window
instead of trusting a COLA constant, so the window and overlap are free to
change without silently rescaling the output.

Three things the clip has to be honest about, because in each case what you
hear is wider than what you see:

- **A viewport can be 24 samples across.** Played as-is that is half a
  millisecond; looped, it would be a buzz whose pitch is the loop rate rather
  than anything in the recording. Clips are widened to `MIN_PLAY_MS` and the
  status says `wider in time`.
- **A band can be narrower than one FFT bin.** It survives as that one bin —
  silence would be the wrong answer — and the status says `wider in band`. The
  test for this is whether the transform was long enough to fit
  `MIN_BAND_BINS` inside the band, *not* whether the band collapsed to nothing:
  a hairline band collapses to one bin, which is audible and still far wider
  than the picture, and an earlier version reported that as unwidened.
- **The playhead can be outside the picture**, whenever the clip is wider than
  the viewport. It hides rather than parking at the edge, which would claim the
  sound was somewhere it is not.

The playhead is a DOM element, not something drawn into the picture: a
full-view redraw costs ~90 ms, so animating a line by re-rendering would cost
more per frame than the analysis budget allows. Nothing about the picture
changes while it sweeps.

**Recording stops playback**, or the take is a recording of the recording
coming out of the speakers. `press()` does it before the mic opens.

**A press is a recording or a pan, and the first 180 ms decides.** The whole
screen being the button collides with drag-to-pan, and the resolution is that
`main.js` waits `HOLD_MS` before starting a take while `zoom.js` watches for
`DRAG_SLOP` of movement; whichever happens first wins. Three things make it
work and each was needed:

- **Waiting costs no audio.** `beginTake(lagMs)` reaches back by the real press
  time and the sound is already in the ring, so a press that survives the wait
  starts where it was made. `LEAD_TRIM` then skips forward by 150 ms, which
  very nearly cancels the 180 ms reach-back — takes begin within about 30 ms of
  where they did before drag-to-pan existed.
- **Both files ask `canPan()` once, off the same event.** It is false at full
  view, where there is nothing to pan and the press must record immediately —
  which is every press made before a recording exists. Re-asking it later would
  let the two disagree about what a press was halfway through it.
- **Committing to a take disarms the drag** (`gestures.cancelDrag()`). Without
  it a hand that drifted *after* the take started was read as a pan and threw
  the recording away — a hold long enough to be worth keeping is exactly the
  hold most likely to wander.

A tap shorter than `HOLD_MS` on an existing picture does nothing at all. At full
view it still runs the short-take nag, because there the press did record.

**The mic stays open with a ring buffer.** A freshly opened capture stream
delivers ~200 ms of silence and a startup click. `WARMUP_SEC` discards it;
`LEAD_TRIM` skips forward past the sound of the button press itself.

**`beginTake(lagMs)` reaches back by the real press time.** This mattered more
when the analysis blocked the main thread for seconds at a time, but it still
matters: the commit at the end of a pass blocks for up to a second, so a press
landing in it is not seen until it finishes, by which point its audio is already
in the ring. Event timestamps recover it; without this the take comes out
empty.

## Parameters worth knowing

`reassign.js`
- `COHERENCE_SIGMA = 0.15` — how hard neighbour disagreement is punished.
  Smaller kills more dust but starts to gate the real ridges of close
  harmonics, whose estimates genuinely wobble during beats (their combined
  residual sits around 0.19 against ~0.005 for a lone tone).
- `GAUSS_LUT = 2048` — entries in the tabulated coherence Gaussian, over the
  four sigma at which it reaches zero. Error 5e-7; see above for why a table
  and not an approximation.

`ridge.js`
- `REACH = 64` samples — the distance corroboration is asked over, both here
  and as `reassign.js`'s cross-frame probe, and the ridge map's frame spacing.
  Part of the zoom invariant: changing it recolours every recording. It cannot
  be widened to make long takes cheaper — see above.
- `LINK_CUT = 0.4` — how far off its own direction a step may be and still
  count as a link, in the same normalised units as the coherence residual.
  Loose on purpose: one link is weak evidence, and it is the chain that
  convicts.
- `SUPPORT_LO = 1.5`, `SUPPORT_HI = 6` — resolution cells of chain, from
  nothing believed to fully believed. White noise's chains die at about one.
- `LOBE_BINS = 4` — the Hann main lobe, which is what makes a run along
  frequency comparable with a run along time.
- The map costs ~45 ms per second of audio and one byte per (`REACH` samples ×
  unpadded bin) — 0.4 MB for a one-second take, 12 MB for the 32 s the ring
  can hold. Built once per recording, on the first analysis, and then read by
  every pass.

`render.js`
- `POOL = min(8, hardwareConcurrency − 2)` — analysis threads, eight on the M4.
  Two are left for the main thread and the compositor. Swept against 4, 5, 6, 8
  and 10 with two runs each: the full-view pass falls monotonically with the
  count (1.23 s at four, 0.98 s at eight, 0.92 s at ten) while the deepest
  passes are noisy and mildly prefer fewer, since a region that lands on an
  efficiency core gates a round it cannot be stolen out of. Eight is the middle
  of that; ten was clearly worse at 256×.
- `MAX_REGIONS = 2 · POOL`, `OVERLAP_COST = 0.5` — the region-count model. The
  cap allows a second round when regions are cheap enough that balancing across
  fast and slow cores is worth more than the extra overlap. `OVERLAP_COST` is
  what a region's `2·D` extra frames cost as a fraction of one of its own —
  they are transformed but never emitted, and the transforms measured 0.42 of a
  frame at the full view and 0.46 at maximum padding, so one figure serves.
- `WIN_MS = 25` — analysis window duration. Sets the character of the whole
  picture. Larger separates harmonics better, smaller sharpens transients.
  Also why `F_MIN = 60` is a floor, not an aesthetic: below ~1.5 cycles per
  window the phase estimates are garbage, and 25 ms holds 1.5 cycles at 60 Hz.
- `MAX_CELLS = 48e6` — 960 MB of GPU buffer (20 bytes a cell), ~4.5 s of
  analysis, and the strongest detail knob there is: it is the only one that
  improves the picture at *every* zoom. Measured on the M4, mean fraction of
  its gap a stroke covers — full view 0.68 → 0.99 going from 16M to 48M, 116×
  0.04 → 0.08, and four times as many cells on screen at depth. 64M was tried
  and is not worth it: no better than 48M below 100×, and the settle at 116×
  doubles to 11 s.
- `MAX_FFT = 262144` — how far zero padding may go, which is *not* a resolution
  limit (the window sets that) but how finely the reassignment field is sampled
  along frequency. Deep into a zoom that sampling is what runs out first, and
  the reason is structural: `plan()` can always spend frames to close the time
  gap, but the bin gap is fixed by the padding, so it is the one that gets
  stuck. See below.
- `MAX_RING_CELLS = 18e6`, `MAX_POOL_RING_CELLS = 72e6` — bounds on
  `reassign.js`'s coherence ring, which is `bins × (2·D+1)` cells and grows as
  the hop shrinks. The first is per region and `plan()` takes a coarser hop
  until a grid fits it; the second is for the pool as a whole and is spent by
  running fewer regions at once instead, since coarsening the hop for it would
  be spending detail on a memory problem. Only binds below about 200×, and there it decides
  whether the hop can stay at 1 alongside the maximum padding: at 256×, 9e6
  puts 357 cells on screen and 18e6 puts 702. 36e6 picks exactly the same grids,
  so this is the ceiling and not a compromise. Worst case ~380 MB of
  `Float32Array`, held only for the length of a pass.
- `MAX_DPR = 2` — the display's own ratio, and rendering above it makes the
  picture *worse*, which is the opposite of what supersampling suggests.
  `TARGET_GAP` is in device pixels, so a higher ratio spends the cell budget
  sampling time more finely and leaves less for the padding that closes the
  frequency gap. At 3 it cost two thirds of the 256× view (mean luma 36.1 →
  11.6, lit pixels 29% → 11%).
- `TARGET_GAP = 0.6` px — how finely time is sampled before the remaining budget
  goes to padding.
- `ANALYSIS_MARGIN = 0.35` — analysed beyond the viewport, once the budget stops
  covering the whole recording.
- `WORTH_REDOING = 0.7` — how much finer a second pass has to be to be worth
  running at all.
- `EXPORT_SCALE = 8`, `MAX_EXPORT_PIXELS = 200e6` — the `S` key. The scale is
  deliberately larger than any canvas will use, so the pixel cap is always what
  decides and every export comes out as big as the browser will carry:
  19901×10050, 3.4 s, a 116 MB PNG. The cap is set from a measurement rather
  than a guess — a 2D canvas of 253 MP still reads back on this machine and one
  of 288 MP does not (the ceiling is 2²⁸ px), so 200e6 leaves room for a
  fuller-screen window.

`glview.js`
- `MIN_HALF = 0.6` px — stroke half-length floor, so a dense cloud draws as
  points rather than smears.
- `MAX_HALF_SCREENS = 3` — a cost bound, not an aesthetic one: deep into a zoom
  one bin at the bottom of a log axis can span many screen heights.
- `HUE_GAIN = 0.7` rad, `HUE_Q1 = 200`, `HUE_Q2 = 6000` Hz/s, `SAT_FLOOR =
  0.35` — the chirp-hue and coherence-saturation channels. Keep the gain mild:
  push it and the picture goes psychedelic and amplitude stops being legible.
- `BACKGROUND_PERCENTILE = 5`, `MIN_RANGE = 12`, `CONTRAST_RANGE = 36` — the
  exposure. Tuned together by eye; changing one alone will look wrong.
- `PROBE = 384` — background measured from a point-sampled copy this size, never
  averaged (a percentile of averages is not the percentile we want).

`zoom.js`
- `DRAG_SLOP = 8` px — movement before a press is a pan rather than a hold.
  Generous on purpose: a finger resting on glass is never quite still, and
  3 px of drift must not cost a recording.

`glview.js`
- The `pick` target and `PICK_FS` program exist solely for `sampleCell`; they
  cost one 1×1 float framebuffer and one tiny program, created once.

`playback.js`
- `MIN_PLAY_MS = 120` — the shortest clip worth looping. Below this you hear
  the loop rate rather than the sound.
- `MIN_BAND_BINS = 4` — resolution the band filter aims for. Fewer and the
  filter rings, and the result reads as a sine whatever went in.
- `MAX_FILTER_FFT = 32768` — where the filter stops chasing a narrowing band.
  Past it the sound is wider than the picture and says so.
- `EDGE_FADE_SEC = 0.005` — same reasoning as `recorder.js`'s `FADE_SEC`, but
  the tick it removes would land on every pass of the loop.

`recorder.js`
- `FADE_SEC = 0.004` — raised-cosine at each end of a take. A hard cut is a
  step and a step is broadband; without this every recording had a bright
  vertical curtain down its edges that was never in the sound.

`main.js`
- `SWEEP_MIN_CONF = 0.4` — below this the readout will not name a sweep
  direction. Sits above the measured power-weighted means for white noise
  (~0.33) and two-component loops (~0.38), and below what a real ridge keeps
  even while beating (~0.61).
- `HOLD_MS = 180` — how long a press stays ambiguous between a take and a pan.
  Longer makes panning feel sticky; shorter starts taking recordings off the
  beginning of a drag.
- `MIN_SPAN = 24` samples, `MIN_RATIO = 1.001` — the zoom stops, in both axes,
  both far past what the analysis can resolve. Andrew asked for them to be
  removed; past a few hundred × the picture simply thins out, which is a thing
  worth being able to see. `MIN_RATIO` in particular: without it the frequency
  axis stopped zooming at a 1.5:1 ratio while time kept going, and the picture
  stretched sideways.

## Rendering pipeline (`glview.js`)

0. **skip** — if the buffer already holds this exact viewport, nothing below
   runs. See `accumFor`.
1. **accumulate** — every visible cell drawn as an antialiased quad along its
   own ridge, additively blended into an `RGBA32F` framebuffer (falls back to
   `RGBA16F` without `EXT_float_blend`). One instance per cell, four vertices,
   one instanced draw call per region of the pass.
   R accumulates power, G power·conf·hueDrive, A power·conf; clear is
   `(0,0,0,0)` because alpha is data.
2. **decimate** — a small point-sampled copy read back so the CPU can measure
   the background level per band, smoothed over frequency with a Gaussian. Runs
   only during `calibrate()`, not per frame. Reads R only.
3. **present** — dB, background subtraction, colour ramp; then hue rotated
   about the grey axis by the pixel's mean coherent chirp drive, and saturation
   pulled towards grey by 1 − mean coherence. To the screen or to an offscreen
   RGBA8 target for one export tile.

WebGL2 with `EXT_color_buffer_float` is required. There is no CPU fallback — it
was removed deliberately: it could not do interactive zoom, and it was 236 lines
that had to be kept in step with the shaders.

## Testing

There is no test runner. Verification is by driving real Chrome over CDP with
Node's built-in `WebSocket` — scripts live in the session scratchpad, not the
repo. Recreate as needed:

```
chrome --remote-debugging-port=9223 --user-data-dir=/tmp/prof \
       --use-fake-ui-for-media-stream --window-size=1400,850 about:blank
```

- **`Page.bringToFront` before driving anything**, and check that it worked:
  read `document.hidden` and start over with a fresh browser if it is true.
  `bringToFront` does not raise a window another application is covering, and
  an occluded tab delivers no input events and fires no `requestAnimationFrame`
  — every script silently does nothing. It cost half an hour here because the
  symptoms all looked like a real regression: takes that never recorded, a
  black 21 KB screenshot, and a "longest block" of 1005 ms every single run.
  That last one is the tell — a background tab throttles `setInterval` to
  exactly 1 s, so the measurement was of the throttle, not of the app.
- **`getUserMedia` does not work in headless Chrome** under any flag
  combination. Monkey-patch it via `Page.addScriptToEvaluateOnNewDocument` to
  return a `MediaStreamAudioDestinationNode` stream, so everything below the mic
  still runs. A speech-like source (buzz with vibrato, moving formants, breath
  noise, a few transients) exercises far more of the picture than a pure tone.
- **Synthesise that source when the patch is injected, not inside the patched
  `getUserMedia`.** Forty harmonics over six seconds takes a few hundred
  milliseconds, and doing it between the press and `src.start()` shifted the
  recorded audio by a different amount every run — which is invisible at full
  view and completely changes the picture at 100×. Even with it fixed, takes
  still vary by a millisecond or two, so deep-zoom comparisons are between
  *similar* pictures, never identical ones: judge them by distribution
  statistics over the whole frame, or by eye, not by diffing pixels.
- **Synthetic pointer events are untrusted**, so `audioCtx.resume()` never
  resolves. Use `Input.dispatchMouseEvent`, which is trusted.
- **`gl.finish()` does not sync in WebGL.** Force a drain with a 1×1
  `readPixels` before timing anything, or you will measure zero.
- **Avoid `Emulation.setDeviceMetricsOverride` / `setTouchEmulationEnabled`** on
  a profile you want to keep using — they can poison input delivery for the rest
  of the browser session. Restart Chrome instead.
- Screenshot byte size is a decent proxy for "did anything render": a black
  screen compresses to ~20 KB, a spectrogram to 1–7 MB.
- Reading the canvas in-page returns blank for WebGL (`preserveDrawingBuffer` is
  off). Use `Page.captureScreenshot`, or `view.tile()`, which reads back real
  pixels and is what the quantitative comparisons above were built on.
- **The spinner is what a driver should wait on**, not a fixed sleep: read
  `#busy`'s class. Wait for it to come *on* first — a pass that has not started
  yet looks exactly like one that has finished, and the settle timer is 400 ms.
- **Two things about the analysis can be checked without a browser at all**, and
  both are worth rebuilding whenever `reassign.js` changes. Splitting a grid
  into 2, 3, 5, 8 and 16 regions must reproduce a single call bit for bit —
  that is the guarantee the whole pool rests on. And running the old
  `analyzeCells` beside the new one over the same synthetic speech says exactly
  what an optimisation cost: `t`, `f`, power and angle identical, coherence
  within 5.4e-7.
- A picture-neutral change can be checked harder than by eye: drive the same
  zoom sequence on both builds and compare the PNGs. Two independent runs came
  out at identical screenshot byte counts at every zoom, and pixel diffs of
  0.0007–0.0024% of pixels at one to three levels.

Sanity numbers on a 0.95 s take at a 2800×1414 canvas: `hop 16, fftSize 8192,
2850 frames, 11.7 M cells`, analysis ~1.3 s, draw 93 ms at full view and 5 ms
at 100×.

Blocked main thread on the M4 at `MAX_CELLS = 48e6`, before and after the
analysis moved to the pool. Same 1.2 s take, same zoom sequence, same window,
longest gap between ticks. The middle two columns are one matched pair on a
freshly started browser; the last two are the range over three runs of the old
build and eight of the new.

| | main thread | pool | whole wait | range, old | range, new |
|---|---|---|---|---|---|
| first analysis | 6.5 s | 1.3 s | 2.3 s | 6.4–7.0 s | 0.6–1.3 s |
| settle at 5× | 4.8 s | 0.13 s | 0.88 s | 4.5–4.8 s | 0.09–0.34 s |
| settle at 24× | 4.0 s | 0.10 s | 0.76 s | 3.9–4.0 s | 0.10–0.14 s |
| settle at 116× | 6.9 s | 0.66 s | 2.5 s | 6.8–14.8 s | 0.10–0.66 s |
| settle at 256× | 10.3 s | 0.33 s | 2.9 s | 7.0–10.3 s | 0.17–0.55 s |

"The whole wait" is the spinner: how long the pass took end to end, of which
only the block is felt as a freeze. There is no such column for the old build
because the two were the same number. Nor is there an honest "can you drag
during a pass" figure for it — the pointer events simply queue up and are
delivered after the freeze. On the new build the worst frame during such a drag
is 120–290 ms across six runs. The whole wait varies more than the block does —
the deepest settles have been seen at anything from 1.7 to 5.5 s on a machine
that has been running analysis passes for an hour.

Getting that last figure honest was worth a section of its own; see **the
buffer has to be orphaned** above. Before that fix it was 2.2 s in a third of
runs and 65 ms in the rest, and the bimodality survived cutting peak memory
from 4.0 GB to 2.4 GB, which is what had looked like the culprit.

What is left of the block is the commit: reallocating and refilling the vertex
buffer (46 M cells is 930 MB), and on a first analysis only `calibrate`'s
`readPixels`, which stalls until the GPU has finished accumulating the whole
cloud. Making that readback asynchronous through a pixel-pack buffer and a
fence was considered and left alone: it lands once per recording, at a moment
when there is no picture to interact with yet.

The single-threaded analysis also got faster, before any of the pool: 1.35× at
the full view's grid, 1.57× at 24×, 1.89× at the deepest. See the zero-padded
FFT and the two hot-loop entries above.

Panning stays at 120 fps throughout (median frame 8–9 ms), because the draw
only ever touches the visible stretch of the cloud.

Measure that block from *inside* the page — a `setInterval` recording
`performance.now()`, then the largest gap between ticks. Polling with
`Runtime.evaluate` from the driver measures nothing, because CDP evaluates are
served even while the renderer is in a long task; worse, an evaluate that
*clears* the tick array is itself served mid-block and wipes the evidence of
the very thing being measured. The ridge map adds ~45 ms per second of audio to the *first* analysis
of a recording only — 1.2 s on the 32 s the ring can hold, which is the one
case where it is worth thinking about. Roughly half of that is its transforms;
the rest is the link tests.

## Known limitations

- **Ridges are tracked, but segments are still drawn independently.**
  `ridge.js` follows each chain and tells every cell how far the ridge under it
  runs, which is what finally convicted white noise's coherent tail — but the
  *geometry* is unchanged: a stroke still points along its own measured
  direction and is still as long as the gap to where its neighbour ought to be,
  rather than ending exactly where the neighbour actually is. Drawing the
  chains as real polylines is the piece left undone. It would cost the link
  displacement per cell — two more floats on a 20-byte cell, or half-float
  packing to avoid them — and the visible gain looks small, because where the
  gap is big enough for the difference to show, coherence is high enough that
  the measured direction and the actual neighbour nearly agree.
- Where two components fall inside one analysis window, reassignment places
  their energy at a weighted average of the two. This is the technique's known
  failure mode and shows up as the looping filaments between close harmonics.
  Coherence now suppresses most of it (the loops fail the cross-frame test),
  at a cost worth knowing: the *real* ridges of two close components also lose
  some coherence during beats, because their estimates genuinely wobble — that
  is the physics, not a bug.
- The other ideas from the 2026-08 ChatGPT review that were judged and
  deliberately *not* taken: occupancy-based noise floor (risks a tuned system
  for a corner case), frequency-dependent cell thresholds (drops quiet detail),
  F_MIN = 20 Hz (garbage below ~60 Hz at a 25 ms window). Worker-based analysis
  was on that list too, on the grounds that it buys responsiveness rather than
  picture and Andrew had ranked picture first; he then asked for it directly,
  and it turned out to buy some picture as well, since a pass short enough to
  be cheap is a pass that can afford a finer grid. Multiscale analysis —
  several window lengths analysed up front, finer scales *adding* structure at
  depth without repainting coarser ones — is now the big worthwhile one left.
- **A superseded pass still has to finish.** Gesture again while one is
  running and the new one queues behind it, because a worker in the middle of a
  region cannot be interrupted without a `SharedArrayBuffer` and the page is
  not cross-origin isolated. In practice one gesture burst fires one pass, so
  this costs a doubled wait rather than anything worse.
- **The commit still blocks**, 0.6–1.0 s on the first analysis of a recording
  and 0.1–0.5 s on a settle: reallocating and refilling up to 930 MB of vertex
  buffer, plus a `readPixels` that waits on the GPU. Spreading the upload over
  several tasks would mean drawing out of a buffer being overwritten, which
  needs a second gigabyte to stage into.
- The picture arrives in two stages past ~2×: the cloud in hand is re-projected
  instantly, then the refined pass lands about a second later. Measured on a
  ~1 s take — 40×: 503 KB of screenshot immediately, 2034 KB once settled;
  196×: 83 → 239 KB. Anything that reads a screenshot has to wait for the
  second one or it will conclude the picture is empty.
- Useful depth now runs past 250×, and what limits it is the *frequency*
  sampling rather than the time sampling. On a ~1 s take at 256×, screenshot
  mean luma across the three settings that decide it: 0.69 at the old
  `MAX_FFT = 32768` and `MAX_CELLS = 16e6` (a scatter of dots), 14.25 with the
  cap raised, 36.06 with the cell budget raised too — lit pixels 0.5% → 9% →
  29%. Past ~500× the worst gap is a hundred pixels again and the picture
  genuinely thins out, which is still worth seeing.
- Longer recordings get fewer frames per second of audio, since `MAX_CELLS` is
  fixed. Zooming in recovers the detail.
- Peak memory is roughly 1 GB of GPU vertex buffer, up to 250 MB of
  `Float32Array` for the coherence ring *per region in flight* and about 1 GB
  of it across the pool (`MAX_POOL_RING_CELLS`), up to 930 MB of staged cells, and up to 800 MB of 2D canvas while an export encodes.
  Measured renderer RSS at 256× is 2.4 GB at the peak of a pass, down from
  4.0 GB before the ring was split in two and the pool budget added. All three were verified to allocate on the M4 (a 2 GB buffer
  still succeeds), and a full session — record, zoom to 957×, back out, export
  — runs with no renderer crash. Nothing here is sized to survive a phone.
- The export is one PNG on a 2D canvas, so it is bounded by the browser's canvas
  area limit, not the GPU's — hence `MAX_EXPORT_PIXELS`.
- Untested against a real microphone by Claude in every session; the live mic
  path always runs first for Andrew. Say so rather than implying otherwise.
