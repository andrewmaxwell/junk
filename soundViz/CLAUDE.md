# soundViz

Hold anywhere to record from the microphone; on release the sound is drawn
full-screen as a **reassigned spectrogram**. Scroll or pinch to zoom in on any
part of it, drag to pan once you are in, tap a point to read off what is there,
`P` to hear the part you are looking at, `S` to save it as a large PNG. Served
from `http://localhost:3000/soundViz/`. No build step, no dependencies — plain
ES modules loaded by `index.html`.

The look being chased is the MATLAB spectrograms from Mythbusters: fine bright
filaments on black, not fuzzy blobs.

**The source files carry their own reasoning.** Every constant is declared
beside a comment saying what it costs and what was measured against it, so this
file is the map rather than the territory: read it to orient, then read the
file. What lives here is what no single file owns — the standing requirements,
the invariants that span several files, and the list of things not to undo.

## Priorities

Andrew's stated order: **detail and aesthetics first, UI responsiveness
second.** Spending a second of analysis to make the picture better is the right
trade. Do not quietly optimise for frame rate at the cost of image quality.

The second standing requirement: **the picture must not change when you zoom.**
Zooming may add detail; it may not restate the picture in different terms.
Several things below exist only to hold that line.

**The target is one machine: Andrew's M4 MacBook Pro.** He tried it on a phone,
it crashed during analysis every time, and his answer was "remove anything
specifically for mobile and turn up the knobs for maximum quality". The budgets
are sized for ~16 GB of unified memory and a GPU that will take a one-gigabyte
vertex buffer, and **a phone is expected to crash**. Do not quietly lower them
to make some other device work; that is undoing the decision, not fixing a bug.
The touch handling in `zoom.js` and `index.html` stays because it costs nothing
and a trackpad uses some of it.

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
| `ridge.js` | per recording: how far each ridge runs, and how the scales divide the energy |
| `fft.js` | iterative radix-2 complex FFT |
| `render.js` | picks the sampling grids, drives `reassign` → `glview`, tiles the export |
| `glview.js` | WebGL2 renderer: accumulate → measure background → colour → per-pixel readback |
| `zoom.js` | viewport model (samples × Hz), gesture handling, hold-vs-drag |

Dependency direction: `main → {recorder, render, zoom, playback}`, `render →
{ridge, glview}` and, across a worker boundary, `analysis-worker`;
`analysis-worker → {reassign, ridge}`, `reassign → {fft, ridge}`, `ridge →
fft`, `playback → fft`. Nothing else imports anything. Note what `render.js`
does *not* import: `reassign.js` runs only inside a worker. What it still takes
from `ridge.js` is `REACH` — the one distance both files ask corroboration
over, and letting those two numbers drift apart would mean two different scales
claiming to be the same measurement. `playback` is handed the `AudioContext`
rather than reaching for it, which is what keeps it off `recorder`.

## What a single drawn segment means

This is the thing to understand before changing anything. Each segment is **one
cell of one STFT** — one (frame, frequency-bin) pair at one of the window
lengths the sound is analysed at. There are tens of millions.

- **x** = `t̂`, the *reassigned* time. Not the centre of the analysis window:
  the phase of the transform says where inside that window the energy actually
  sat. Sub-sample precision.
- **y** = `f̂`, the *reassigned* frequency, on a log axis. Not the bin centre —
  again recovered from phase. This is why a tone draws as a hairline rather
  than a fat band: every bin of its main lobe collapses onto the same `f̂`.
- **angle** = the local **chirp rate** `∂f/∂t`, measured. Horizontal is a
  steady tone, vertical is a click, diagonal is a glide.
- **coherence** = how much the neighbouring estimates corroborate this cell
  *and* how far the ridge it sits on actually runs, 0..1. Measured, not styled.
  It decides how much stroke a cell earns and how vivid it draws, which is what
  keeps the interference residue from posing as signal.
- **length** = **nothing about the signal.** It is the on-screen distance to
  where the neighbouring cell falls — scaled by coherence, so only a
  corroborated direction bridges the gap and an ambiguous cell stays a point. A
  drawing decision, not a measurement.
- **brightness** = accumulated power in that pixel, in dB, relative to the
  background level of that frequency band, through a monotonic-brightness ramp.
  So brightness *is* amplitude — but amplitude relative to the recording's own
  noise floor, not absolute. Each window length draws only its **share** of
  that energy, and the shares sum to one, so the several clouds together carry
  exactly one recording's worth of power.
- **hue lean** = mean chirp rate of the coherent energy in the pixel: rising
  sweeps lean towards blue, falling towards yellow, steady tones and clicks
  stay put. **Saturation** = mean coherence: dust greys out. Both are
  deliberately mild — brightness stays the thing colour reads as.

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
`X_dw/X = −i(ωi − ω) − i·q·(X_tw/X)`. The first term is purely imaginary, so
taking real parts leaves `Re{X_dw/X} = q·Im{X_tw/X}` — both quantities already
in hand, so **the ridge direction costs no extra transform.** `reassign.js`
stores the *pair* as an angle, never the ratio: a steady tone has zero rise, a
click has zero run, and `q = rise/run` blows up on one or the other. As a
direction vector both cases are finite and no regularisation is needed anywhere.
Verified numerically: a 300→8000 Hz chirp recovers as 0.160416 Hz/sample against
a true 0.160417; a steady tone gives exactly 0; an impulse gives 90° everywhere.

**FFT packing.** `w` and `tw` are packed into one complex transform (real into
`re`, real into `im`) and unpacked per bin via Hermitian symmetry; `dw` needs a
second. Two transforms per frame, not three. Validated to 1.9e-6.

**Coherence** (`reassign.js`). A real one-dimensional structure is measured many
times over — every bin its lobe spreads across, every frame whose window covers
it — and all those estimates land on the same ridge: the displacement from one
to the next lies *along* the direction the cell itself measured. Each cell is
asked whether two neighbours corroborate it, and the perpendicular residual
(in units of `winLen/4` samples × one unpadded bin), through a Gaussian, is the
coherence.

One neighbour is not enough, and this was measured before it was believed. The
neighbouring *bin* alone convicts noise and sidelobes but acquits the looping
filaments reassignment hangs between two components sharing a window — the loops
are locally smooth, so along frequency they corroborate each other. The
neighbouring *instant* convicts them: the loop wanders off its measured
direction as time advances. Coherence takes the worse of the two residuals, and
the best of each pair of sides, so a cell at the edge of a lobe or at an onset
is not convicted by its one empty flank. Power-weighted means: clean tone /
chirp / click ≈ 1.0 / 0.96 / 0.96; two-component loops 0.38 (their own ridges
keep 0.61); white noise 0.33; sidelobes 0.17–0.24.

Both comparisons are pinned to *absolute* distances so no pass can recolour
cells another pass emitted. Along frequency the neighbour is one **unpadded**
bin away; along time it is `REACH = 64` samples whatever the hop, which is why
frames pass through a ring and are emitted `D = 64/hop` frames behind the
analysis.

**Ridge support** (`ridge.js`), the thing two neighbours cannot tell you. The
reassignment field of white noise is smooth over roughly one analysis window, so
its most coherent tail passes the per-cell test as convincingly as a partial
does — a ceiling on *any* per-cell test, and what still chained into faint
filaments at deep zoom. What separates the two is **how far the agreement keeps
going**: noise runs out after about a window, structure does not.

So a second, much cheaper pass walks the chains, on a grid of its own — `REACH`
samples apart, no zero padding. Each cell is linked to its neighbour in time and
in frequency wherever the step lies along the direction *both* ends measured,
and the length of the whole maximal chain through every cell is recorded.
Lengths become **resolution cells** (one window of time, one Hann main lobe of
frequency) so the two axes can be compared, the larger wins, and a smoothstep
turns that into a 0..1 gate that `reassign.js` multiplies into the coherence it
emits: corroborated by its neighbours *and* part of something that lasts.

Both axes are needed. A steady tone chains along time forever but only across
its own lobe in frequency; a **click chains across thousands of bins and barely
more than one window in time** — a time-only test would convict every transient
in the picture. Power-weighted mean gate: tone / chirp / click / two close tones
all 1.00, speech 0.96, white noise 0.12 on a 1.5 s take.

Driven over CDP, that lands where it was aimed and nowhere else: white noise at
116× went from mean luma 4.95 to 0.63, while the quiet high band of a speech
take went 2.29 → 0.96 mean *with its 99.9th percentile unmoved* (222.7 → 222.7).
The dust went, the filaments stayed, and the full view was untouched.

**A link spans a fixed fraction of the window, not a fixed number of samples**
(`LINK_WINDOWS = 1/16`), and this is what makes chain lengths comparable between
one window length and another. Two frames `REACH` apart share 98% of a
4096-sample window, so a chain of them proves nothing: with the link pinned to
`REACH`, white noise linked clean across a recording and the longest window
claimed 98% of the energy. A sixteenth of a window is what `REACH` already was
for the base window, and widening it to an eighth costs speech a quarter of its
gate, because vibrato moves a harmonic off its own direction over that span.
Time runs are counted in frames of the map, so a long window links across
several of them and its chains run on that many interleaved lattices.

**Multiscale.** One window length is one compromise between separating
harmonics and placing transients, and no single choice suits a whole recording.
So the sound is analysed at three — `SCALE_STEPS = [1/4, 1, 4]` around
`WIN_MS = 25`, which on a 48 kHz recording is 5.3 / 21 / 85 ms — all of them,
up front, for every pass.

Four times apart, not two: at two the analyses are alike enough that each adds
little. The short window resolves events milliseconds apart, where one window
covering both puts their energy at a weighted average of the two. The long one
holds six cycles at 80 Hz instead of one and a half, which is what opens up the
bottom of the picture, and separates a vibrato's sidebands from its carrier.

Each scale is a *complete* account of the sound, so drawing all three at full
power would treble the brightness and amplitude would stop meaning anything.
Instead **the energy is divided between them**, on the share arena in
`ridge.js`: absolute instant along one axis (the ridge map's own `REACH`-spaced
frames), absolute frequency along the other, rows spaced evenly in `sqrt(f)` —
not in `f`, which would put the whole 60–200 Hz region into one row, and not in
`log f`, which would cost a logarithm per cell at lookup time.

A window's **fitness** in an arena cell is the power-weighted mean of its
support gate there. The gate is the right quantity and the per-cell coherence is
not, because the gate is already measured in resolution cells and so means the
same thing at every window length, whereas coherence probes a neighbour `REACH`
samples away whatever the window — a quarter of a short one and a sixteenth of a
long one, a test so much easier for long windows that it would hand them
everything. Fitnesses are raised to `FIT_GAMMA`, floored, weighted by a prior,
and normalised.

The **prior is each scale's share of the cells**, and it is there to break ties
rather than to decide anything. A plain tone is explained perfectly by every
window that can see it, so on fitness alone the three would draw the same
hairline three times over — one line paid for three times out of a budget split
three ways. The prior hands such a tie to the window with the cells to draw it,
so power and cells run out together and a scale whose strokes have stopped
meeting is also a scale carrying little of the energy. Where a window genuinely
fits better, a factor of two against a fourth power decides nothing.

A window that saw no power at all takes no share rather than a floored one:
"this window has nothing to say here" is not "no window has anything to say
here", and only the second is a reason to divide evenly. The accumulators are
blurred before the division, not the shares afterwards, which keeps the sum at
exactly one.

Measured, power-weighted share of 256 / 1024 / 4096 at 48 kHz:

| signal | 256 | 1024 | 4096 | |
|---|---|---|---|---|
| aperiodic clicks | **0.95** | 0.05 | 0.00 | what the short window is for |
| two tones 60 Hz apart | 0.16 | 0.36 | **0.47** | only 85 ms resolves the pair |
| 80 Hz tone | — | 0.67 | 0.33 | 5.3 ms is band-limited out entirely |
| 3 kHz tone | 0.25 | 0.50 | 0.25 | a tie, broken by the prior |
| periodic click train | 0.24 | 0.51 | 0.26 | a harmonic series, so also a tie |
| white noise | 0.09 | 0.43 | 0.48 | nobody explains it; nothing is lost |

The periodic click train is worth noticing, and it is why the synthetic test
source uses *aperiodic* clicks: a train at a fixed rate is a harmonic series,
which every window length explains equally well, so it discriminates nothing.

Energy conservation was checked end to end rather than argued: one frame of a
3 kHz tone comes to 0.375 at every window length unweighted, and 0.094 / 0.188 /
0.094 weighted — summing back to the 0.375 one scale alone carried, to within
the share map's byte of quantisation.

## How zooming works, and why it looks the way it does

There is no fixed master image. The **cloud of cells is the master** — it is
resolution-independent, so a viewport is projected exactly rather than
interpolated. A raster large enough for 100× zoom would be hundreds of
gigapixels.

Detail is quadratic in zoom, though. Holding both gaps sub-pixel at zoom Z costs
Z² times the cells of a full view, so no single pass can serve every zoom. The
compromise, in four parts:

**One pass covers the whole recording whenever the budget allows it.** On a
~1 s take that holds out to about 2×: panning and zooming inside that recompute
nothing at all. Past it the analysed span shrinks to the viewport and a gesture
triggers a second pass, 400 ms after it stops (`zoom.js`).

**A second pass has to earn its keep.** `analyze()` skips outright unless some
scale's cloud in hand fails to reach across the viewport, or its new grid would
close the gaps by at least `WORTH_REDOING`. Before this guard a nine-notch
scroll fired five separate analyses.

Two traps in writing that test, both of which cost real detail before they were
caught. The gaps have to be evaluated *at the viewport being asked for*, since
zooming scales every gap; and they have to be compared *separately*, either one
closing being enough, because deep into a zoom the frequency gap is pinned at
whatever the FFT cap allows and swamps a `max(gapT, gapF)` comparison. With that
wrong, the 116× view lost two thirds of its cells while looking, from the
console, like it was working.

**The grids nest.** The hop is quantised to a power of two and the first frame
anchored to an absolute multiple of it; `fftSize` is `winLen` times a power of
two, and zero-padding leaves the coarser grid's bins exactly where they were
(`X_2N[2k] = X_N[k]`). So a finer pass is a strict *superset* of the coarser
one: it adds cells at new positions and never moves the ones on screen. Each
scale nests independently, against a budget of its own.

**Four things are measured once per recording and then left alone**, and every
one of them is there to hold the zoom invariant:

| measured once | why not per viewport |
|---|---|
| the exposure (`view.calibrate`) | the estimator asks "how faint is the faint end of what is on screen"; at 100× that has nothing to do with the noise floor. Measured: per-band background ran −113…−54 dB at full view and −25…−20 dB at 116×, a 40 dB swing that showed up as the colours lurching |
| the ridge maps (`buildRidge`, one per scale) | at 100× the analysis covers a few hundred samples, and asking whether ridges persist across that span fails everything, including real partials |
| the share arena (`blendScales`) | which window suits a stretch of sound is a property of the sound; deciding it per viewport would repaint the picture on every gesture |
| the window lengths themselves | `WIN_MS` was once `0.02 × visible span`, so zooming shrank the window from 1024 samples to 128 — every zoom level was a *different analysis* rather than a closer look at one |

All three maps are indexed by absolute instant and by quantities every pass
shares — the unpadded bins for support, `sqrt(f)` rows for shares — so a
re-emitted cell gets back exactly the numbers it already had. Verified:
re-emitting a cloud at half the hop and twice the padding reproduced the support
of **100%** of cells, exactly.

A chain reaching the first or last frame counts as **unbroken**, not as ended: a
partial still sounding when the take stopped did not stop, and this is the same
rule coherence uses when a neighbour is missing. Without it the first and last
~140 ms of every recording would fade. The credit goes only where there was a
cell to credit, though — handing it out unconditionally awarded full support to
every bin of the last frame, which in a recording of pure silence was the only
thing in the map.

Together these mean a second pass reads as detail arriving, not as a different
picture.

## Where the analysis runs

Nothing expensive happens on the main thread. `render.js` picks the grids and
hands the work to a pool of `analysis-worker.js` threads, each holding its own
copy of the recording, of the ridge maps and of the share arena; the main
thread's share of a pass is the GL upload at the end of it. Blocked main thread
went from 4–10 s to 0.04–1.3 s, and the page answers gestures throughout — you
can pan while the pass you triggered is still running, and the picture you are
panning is the one that was already there.

**A pass is every scale at once, cut into regions, one message each.** Region
*i* of a scale is responsible for emitting frames `[frame0, frame1)`, and it
computes `D` frames beyond each of its ends so its cells meet exactly the
neighbours a single call would have given them. `a0`/`a1` clip that to the grid,
which is the whole point: a neighbour is missing only where the grid itself runs
out, so the "a missing side abstains" rule fires at the ends of the recording and
nowhere else, and a region boundary is invisible. Verified rather than assumed —
splitting into 2, 3, 5, 8 and 16 regions is **bit-identical** to one call, at
every window length and every hop including 1, where `D` is the whole of `REACH`.

**The regions of all scales go into one queue**, so a scale that finishes early
does not leave threads idle, and they land in one GL buffer laid end to end.
`glview.js` sets the hop and bin spacing per scale — two uniforms — because the
stroke length a cell earns is the gap to where *its* neighbour fell.

**The ring budget is a limit on threads, not on regions.** Every region in
flight holds a coherence ring of `bins × (2D+1)` cells, and those were the same
thing while a pass was one grid — cut it into fewer regions and fewer are in
flight. They are not once a pass is several scales dealt out together, because
then the regions in flight can all be from the scale with the largest ring. So
`MAX_POOL_RING_CELLS` now caps how many of the pool `share()` may use at once.
How many regions a scale is cut into is `regionsFor()`'s own problem, and its
comment carries the model.

**A pass is staged whole and lands in one piece.** A worker fills its whole
region into one `Float32Array` and transfers it at the end; the main thread does
`begin` → one `pushAt` per region → `end` in a single task. Streaming cells as
they were computed would be cheaper to write and wrong to look at: the cloud in
the GL buffer *is* what is on screen, so writing over it progressively means
drawing half of a new picture on top of half of an old one. There is no second
buffer to stage into — the first one is already a gigabyte. Every region
reserves the stretch its frames would fill at their widest, one cell per bin, so
it knows where its cells belong without hearing how many its neighbours
produced; the gaps that leaves are simply never drawn.

**Passes are discarded, not cancelled.** A worker inside a region cannot be
interrupted — that would need a `SharedArrayBuffer` to poll, and the page is not
cross-origin isolated — so a superseded pass runs to completion and its result
is dropped on a generation check. `zoom.js` fires one pass per gesture burst, and
a pass is short enough that the wait reads as slowness rather than as a freeze.

**The `WORTH_REDOING` guard has to ask about the pass in flight**, not only
about the cloud in hand — `wanted || current`. Asking only about the cloud in
hand would start a second identical pass behind the first, because the first has
not landed yet.

**The ridge phase runs one scale per worker in parallel**, then one worker
blends the fitnesses into shares, then the maps are copied round — with a worker
sent `null` in place of the map it built itself.

## Decisions that were expensive to learn

Each of these was a visible bug first. Do not undo them without reading why. The
detail is in the comment beside the code; this is the index.

**A cell's power must not depend on the hop.** `scale` divides out only the
padding factor, because padding spreads a main lobe over that many more bins
which all reassign onto the same ridge. It must *not* divide by frame density:
halving the hop doubles the cells along a ridge but also halves the gap between
them, and the renderer already divides by how many strokes cover a pixel.
Dividing again made the picture fade every time it was sampled more finely.
**This was the main cause of "the image changes when I zoom".**

**Strokes are instanced quads, not point sprites.** A sprite is square, so a long
stroke pays the fill of its whole bounding box, it is capped by
`ALIASED_POINT_SIZE_RANGE`, and — the one that forced the change — it is
discarded whole once its centre leaves the viewport, which needed an oversized
accumulation buffer and would have torn the export apart at every tile boundary.
A quad costs its own area, clips instead of vanishing, and has no size ceiling.

**Stroke length is the on-screen gap to the neighbouring cell**, computed
per-cell in the vertex shader from that scale's hop and bin spacing, blended by
the ridge direction. A constant pixel length breaks into confetti as soon as the
gap outgrows it.

**Only coherence earns stroke length.** The gap is scaled by
`smoothstep(0.15, 0.6, conf)`, and on top of that only near-perfect coherence
may draw a genuinely long stroke — the cap climbs *geometrically* to the cost
bound (`pow(conf, 8)` in the exponent). A middling direction drawn across a
large gap is a comb tooth lying across the curve the eye follows; before this
gate the deep zoom was solid spaghetti.

**Ridge support gates coherence, never power.** Brightness is amplitude and must
stay amplitude, so a cell that turns out to sit on nothing keeps every bit of
its energy — it loses its stroke length, its extra width and its say in the hue,
and nothing else. The consequence is worth expecting: noise does not vanish, it
stops pretending. The same energy that used to be smeared along a
confident-looking filament lands as speckle, because `coverage` is only ever
divided out and a stroke that shortens to a point concentrates what it carried.

**The share arena gates power, and that is the one thing that may.** It is not a
judgement about a cell but a division of one quantity between several
descriptions of it, and the shares sum to one — so the total is untouched and
brightness still means amplitude. Anything else that multiplies power is a bug.

**More detail meant more padding, not longer strokes.** Both close the gap, but
only one measures anything: a longer stroke extrapolates along one cell's own
direction estimate, while more padding samples the reassignment field at more
points, each placed by its own phase, nesting exactly with the coarser grid.
Relaxing `pow(conf, 8)` tested better in isolation but was visually
indistinguishable once the padding was raised.

**Everything is drawn as dots at depth because the gap outgrows the cap, not
because of anything coherence does.** Worth knowing, because the obvious suspect
was wrong: replaying the vertex shader's own length decision over a real cloud
showed `longCap` binding on 48% of cells with `gapF` at 47 px against `gapT` at
7, and switching the ridge gate off changed none of it.

**Zero padding is most of the FFT, and it is free to skip.** After the
bit-reversal permutation the non-zero entries sit at multiples of `pad`, and
every butterfly stage below `size = 2·pad` combines a value with a zero: those
stages are a *broadcast*, not arithmetic. `FFT.transform(re, im, nz)` does that
instead, **bit-identically** (`a − 0` and `a + 0` are exactly `a`), and saves
the caller zeroing the tail. 1.40× at `fftSize` 8192, 2.34× at the 262144 the
deepest zooms use — exactly where it was needed.

**`Math.hypot` and `Math.exp` were costing a third of a second each, per pass.**
Both are once per cell across tens of millions. `hypot` guards an overflow these
values cannot reach and costs 8.1 ns against 0.64 for `sqrt(x*x + y*y)`; the
coherence Gaussian costs 4.7 ns against 0.96 for a 2048-entry table and a lerp.
A table rather than an approximation on purpose: a re-emitted cell has to get
back the coherence it already had. Cell for cell, `t`, `f`, power and angle come
out bit-identical and coherence moves by at most 5.4e-7. The same reasoning put
the share arena's rows in `sqrt(f)` rather than `log f`.

`Math.atan2` is the one that got away: 16.8 ns a cell, a full second a pass, and
nothing removes it without changing the cell format. Not worth it against a cost
the pool divides by eight.

**The buffer has to be orphaned, and skipping that is not an optimisation.**
`begin()` calls `bufferData` on every pass even when the size is unchanged: it
hands the old storage back and gets fresh memory, so the `bufferSubData` calls
that follow do not wait on draw calls still reading the buffer. Keeping the
allocation was tried; it turned a commit landing mid-drag into a **2.2 s** block
instead of 65 ms, in about a third of runs. Orphaning costs 100–300 ms more per
commit and makes every commit the same as every other.

**The accumulation buffer remembers what it holds** (`accumFor`). The first
analysis used to draw the whole cloud twice over the same full view — once for
`measureBackground`, once to show it. Anything that would change what an
accumulation produces clears it: a new cloud, a resize, an export tile (whose
stroke lengths are measured against a different height).

**Hue must not come from the raw ridge angle.** `tan(angle)` is the chirp rate in
Hz per sample, and audible sweeps are *tiny* in that unit — a 4000 Hz/s sweep
sits at ~5°, so any linear or doubled-angle mapping leaves every sweep untinted.
The drive is `sin(2·atan(q/Q))` at two scales, averaged, which covers slow glides
and fast sweeps and goes to zero for both steady tones (q → 0) and clicks
(q → ∞) — a click must not get a random tint from the sign of ±∞. The axial
ambiguity of the stored direction cancels in the sin·cos product form.

**The accumulation buffer's spare channels carry the extra dimensions.** R is
power; G accumulates power·conf·drive, A accumulates power·conf, and the present
pass recovers per-pixel means from the ratios. Costs no extra memory, but the
clear must be `(0,0,0,0)`: alpha is data.

**Coverage is only ever divided out, never multiplied in.** Past the point where
neighbouring strokes stop touching, scaling up what is left would make a ridge
*brighten* as it fell apart. The numerator is the integral of the fragment
shader's end profile, and the vertex shader computes the matching integral so
the two never drift apart.

**The FFT cap is a detail knob, and the coherence ring is what stops it.**
`plan()` can always spend frames to close the time gap, but the bin gap is set
by the padding alone, so past ~24× it is the frequency gap that sticks. Raising
the cap eightfold costs almost nothing, because a pass is bounded by
`MAX_CELLS` and transform cost grows with the *log* of `fftSize`. What it does
cost is the ring, which grows as the hop shrinks — at hop 1 and maximum padding
it would have been 355 MB per pass. `MAX_RING_CELLS` pushes such grids to a
coarser hop until the ring fits.

**The budget is split to equalise the two gaps.** Cells land in a grid `frames`
wide by `bins` tall and the product is fixed, so the only question is the aspect
ratio. All time and the harmonics come out as rows of dashes; all padding and
the ridges break up along their length. `plan()` samples time as finely as
`TARGET_GAP` asks, spends what is left on padding, and picks the pad minimising
the larger gap. The old rule was time-first with leftovers to padding, and at
full view its leftover branch never fired — which is what made the full view
look like confetti below ~1 kHz.

**Only the visible stretch of the cloud is drawn.** A frame's cells all lie
within half a window of its centre, so the visible cells are one contiguous
range per region. Drawing 16 M cells at full view costs 93 ms; at 100× it costs
5 ms, because 99% are never submitted. Without this a cloud this size would be
unpannable.

**Empty pixels are not quiet pixels.** The background percentile ignores
unsampled pixels; `MIN_SAMPLED` guards bands with too little to measure.

**The colour ramp climbs monotonically in brightness.** MATLAB `jet` runs bright
at cyan, dim at blue-green, bright again at yellow, so a filament of constant
strength appears to break into beads. This single change did more for the
Mythbusters look than any signal processing.

**The mic stays open with a ring buffer.** A freshly opened capture stream
delivers ~200 ms of silence and a startup click; `WARMUP_SEC` discards it and
`LEAD_TRIM` skips past the sound of the button press. **Recording stops
playback**, or the take is a recording of the speakers.

**A tap reads the picture back rather than recomputing it.** Clicking a point
asks the accumulation buffer what it holds there — amplitude above the
recording's own background, mean coherence, mean sweep drive — the same three
quantities on screen as brightness, saturation and hue. `sampleCell` renders one
texel into a dedicated 1×1 `RGBA32F` target rather than `readPixels`-ing `accum`
directly, because `accum` may be `RGBA16F` and reading a half-float framebuffer
back as `FLOAT` is not universally supported.

Three things follow. An empty pixel reports "nothing here" rather than a
fabricated floor. The reported chirp value is a *lean*, not a rate in Hz/s — the
identical quantity the hue channel visualises, which does not invert back to a
per-partial measurement, and true per-cell phase is gone by then regardless
since reassignment consumes it to produce `t̂`/`f̂`. And the lean is withheld
below `SWEEP_MIN_CONF`: a pixel measured at 5% coherence was happily reporting
"falling 47%", where the picture itself showed no tint at all.

**The readout is reachable at every zoom, including full view.** Two questions
gate a press and they are deliberately not the same one: `hasPicture()` decides
whether the press waits `HOLD_MS`, `canPan()` decides whether the gesture code
arms a drag. `canPan` implies `hasPicture`, so a drag can never be armed on a
press `main.js` chose to record immediately. Escape backs out one layer at a
time, outermost first — the sound, then the readout, then the zoom.

**Playing a viewport is a time slice and a brick-wall filter.** The picture is a
rectangle in time and frequency, so hearing it means clipping both. Frequency is
an overlap-add STFT filter that zeros every bin outside the band — no practical
cascade of biquads has a skirt steep enough for a band that can be a fraction of
a hertz wide. Measured: >100 dB out-of-band rejection. The clip has to be honest
about three ways in which what you hear is wider than what you see; `playback.js`
carries them. The playhead is a DOM element, not something drawn into the
picture: a full-view redraw costs ~90 ms, so animating a line by re-rendering
would cost more per frame than the analysis budget allows.

**A press is a recording or a pan, and the first 180 ms decides.** `main.js`
waits `HOLD_MS` before starting a take while `zoom.js` watches for `DRAG_SLOP`
of movement; whichever happens first wins. Three things make it work and each
was needed: waiting costs no audio, because `beginTake(lagMs)` reaches back by
the real press time and the sound is already in the ring; both files ask
`canPan()` once, off the same event, so they cannot disagree halfway through a
gesture; and committing to a take disarms the drag, without which a hand that
drifted *after* the take started threw the recording away.

**Do not put anything the app needs behind `requestAnimationFrame`.** A
backgrounded tab fires no frame callbacks at all, so a take made just before
switching away sat unanalysed at "analysing…" until you came back. The status
line is painted before the analysis by deferring through a timer instead.

**The status line never goes away once there is a recording**, and **the spinner
is the only thing that says a pass is running** now that a pass does not
announce itself by freezing the page. The spinner sits with the readout — the
numbers beside it are what is about to get sharper — and is a `transform`
keyframe animation, so the compositor keeps it turning through whatever the main
thread is doing. `render.js` counts passes in flight rather than tracking a
boolean, because two can overlap.

## Parameters worth knowing

Every constant is declared beside a comment saying what it costs and what was
measured against it. These are the ones with the most reach:

- **`WIN_MS = 25`, `SCALE_STEPS = [1/4, 1, 4]`, `SCALE_WEIGHTS = [1, 2, 1]`**
  (`render.js`) — the three analyses, and how the cell budget and the tie-broken
  energy divide between them. `WIN_MS` still sets the character of the picture,
  since the base scale carries half of it. The steps are ×4 apart because at ×2
  the analyses are too alike to be worth the split.
- **`MIN_CYCLES = 1.5`** (`render.js`) — the lowest frequency a window is
  allowed to bid for, at 1.5 cycles inside it, below which a phase estimate is
  being read out of noise. This used to be the reasoning behind `F_MIN = 60`
  itself, and it no longer is: 60 Hz was the floor of a 25 ms window, and the
  85 ms window reaches ~18 Hz. `F_MIN` is now just where the axis starts.
- **`MAX_CELLS = 48e6`** (`render.js`) — 960 MB of GPU buffer at 20 bytes a
  cell, and the strongest detail knob there is: the only one that improves the
  picture at *every* zoom. See the comment for the multiscale trade and for the
  64e6 lever.
- **`MAX_FFT = 262144`** (`render.js`) — how far zero padding may go. Not a
  resolution limit (the window sets that) but how finely the reassignment field
  is *sampled* along frequency, which is what runs out first at depth.
- **`REACH = 64` samples** (`ridge.js`) — the distance corroboration is asked
  over, both here and as `reassign.js`'s cross-frame probe, and the ridge maps'
  and share arena's frame spacing. Part of the zoom invariant: changing it
  recolours every recording.
- **`LINK_WINDOWS = 1/16`** (`ridge.js`) — the chain step as a fraction of the
  window, which is what makes chain lengths comparable between scales. See the
  comment; getting this wrong hands the longest window everything.
- **`COHERENCE_SIGMA = 0.15`** (`reassign.js`) — how hard neighbour
  disagreement is punished. Smaller kills more dust but starts to gate the real
  ridges of close harmonics, whose estimates genuinely wobble during beats.
- **`SUPPORT_LO = 1.5`, `SUPPORT_HI = 6`** (`ridge.js`) — resolution cells of
  chain, from nothing believed to fully believed. White noise's chains die at
  about one.
- **`FIT_GAMMA = 4`, `FIT_FLOOR = 0.1`, `SHARE_ROWS = 256`** (`ridge.js`) — how
  sharply the shares decide, how a hopeless cell divides, and how finely the
  arena is cut. All three were swept; see the comments.
- **`MAX_RING_CELLS = 18e6`, `MAX_POOL_RING_CELLS = 72e6`** (`render.js`) —
  bounds on `reassign.js`'s coherence ring. The first is per region and `plan()`
  takes a coarser hop until a grid fits it; the second is now a limit on how
  many threads a pass may use at once.
- **`POOL = min(8, hardwareConcurrency − 2)`** (`render.js`) — eight on the M4.
  The full-view pass falls monotonically with the count; the deepest passes are
  noisy and mildly prefer fewer, since a region on an efficiency core gates a
  round it cannot be stolen out of.
- **`MAX_DPR = 2`** (`render.js`) — the display's own ratio, and rendering above
  it makes the picture *worse*: `TARGET_GAP` is in device pixels, so a higher
  ratio spends the budget sampling time more finely and leaves less for the
  padding that closes the frequency gap.
- **`HUE_GAIN = 0.7` rad, `SAT_FLOOR = 0.35`** (`glview.js`) — keep the gain
  mild: push it and the picture goes psychedelic and amplitude stops being
  legible.
- **`BACKGROUND_PERCENTILE = 5`, `MIN_RANGE = 12`, `CONTRAST_RANGE = 36`**
  (`glview.js`) — the exposure. Tuned together by eye; changing one alone will
  look wrong.
- **`DRAG_SLOP = 8` px** (`zoom.js`), **`HOLD_MS = 180`** (`main.js`) — the
  hold-versus-pan resolution. Generous on purpose: a finger resting on glass is
  never quite still, and 3 px of drift must not cost a recording.
- **`MIN_SPAN = 24` samples, `MIN_RATIO = 1.001`** (`main.js`) — the zoom stops,
  both far past what the analysis can resolve. Andrew asked for them to be
  removed; past a few hundred × the picture simply thins out, which is worth
  being able to see.

## Rendering pipeline (`glview.js`)

0. **skip** — if the buffer already holds this exact viewport, nothing below
   runs. See `accumFor`.
1. **accumulate** — every visible cell drawn as an antialiased quad along its
   own ridge, additively blended into an `RGBA32F` framebuffer (falls back to
   `RGBA16F` without `EXT_float_blend`). One instanced draw call per region per
   scale, with the hop and bin spacing reset between scales. R accumulates
   power, G power·conf·hueDrive, A power·conf; clear is `(0,0,0,0)` because
   alpha is data.
2. **decimate** — a small point-sampled copy read back so the CPU can measure
   the background level per band, smoothed over frequency with a Gaussian. Runs
   only during `calibrate()`, not per frame. Reads R only.
3. **present** — dB, background subtraction, colour ramp; then hue rotated about
   the grey axis by the pixel's mean coherent chirp drive, and saturation pulled
   towards grey by 1 − mean coherence. To the screen or to an offscreen RGBA8
   target for one export tile.

WebGL2 with `EXT_color_buffer_float` is required. There is no CPU fallback — it
was removed deliberately: it could not do interactive zoom, and it was 236 lines
that had to be kept in step with the shaders.

## Testing

There is no test runner. Verification is by driving real Chrome over CDP with
Node's built-in `WebSocket`, plus a few things checkable in Node alone. Scripts
live in the session scratchpad, not the repo; recreate as needed.

```
chrome --remote-debugging-port=9223 --user-data-dir=/tmp/prof \
       --use-fake-ui-for-media-stream --window-size=1400,850 about:blank
```

**Three things can be checked without a browser at all**, and all three are
worth rebuilding whenever the analysis changes:

- Splitting a grid into 2, 3, 5, 8 and 16 regions must reproduce a single call
  **bit for bit**, at every window length. That is the guarantee the whole pool
  rests on.
- The shares must sum to 255 in every live arena cell, and a scale that saw no
  power must take exactly zero.
- One frame of a steady tone must come to the same total at every window length
  unweighted, and the share-weighted totals must sum back to it. That is
  "brightness is amplitude" stated as an assertion.

Driving the real thing:

- **`Page.bringToFront` before driving anything**, and check that it worked by
  reading `document.hidden`. `bringToFront` does not raise a window another
  application is covering, and an occluded tab delivers no input events and
  fires no `requestAnimationFrame` — every script silently does nothing. The
  tell is a "longest block" of exactly 1005 ms, which is a background tab's
  `setInterval` throttle rather than the app.
- **`getUserMedia` does not work in headless Chrome** under any flag
  combination. Monkey-patch it via `Page.addScriptToEvaluateOnNewDocument` to
  return a `MediaStreamAudioDestinationNode` stream. A speech-like source (buzz
  with vibrato, moving formants, breath noise, plosives and a rattle of
  *aperiodic* clicks) exercises far more of the picture than a pure tone — and
  the aperiodic clicks matter now, because a periodic click train is a harmonic
  series and every window length explains it equally well.
- **Synthesise that source when the patch is injected**, not inside the patched
  `getUserMedia`: doing it between the press and `src.start()` shifts the
  recorded audio by a different amount every run, which is invisible at full
  view and completely changes the picture at 100×. Even so, takes vary by a
  millisecond or two, so deep-zoom comparisons are between *similar* pictures —
  judge by distribution statistics over the whole frame, or by eye.
- **Deep-zoom comparison needs an anchor with something under it.** Past about
  50× the visible band is a few per cent wide, so a fixed anchor walks off
  whatever it was aimed at and *every* build shows an empty screen — which
  looks exactly like a regression. Re-pick the anchor from the picture on
  screen before each burst, or drive both builds to the same named viewport and
  check the status line agrees.
- **`main.js` keys off `e.code`, not `e.key`**, so `Input.dispatchKeyEvent`
  needs `code: 'KeyP'` / `'KeyS'` / `'Escape'` or nothing happens and it looks
  like playback is broken.
- **Synthetic pointer events are untrusted**, so `audioCtx.resume()` never
  resolves. Use `Input.dispatchMouseEvent`, which is trusted.
- **`gl.finish()` does not sync in WebGL.** Force a drain with a 1×1
  `readPixels` before timing anything, or you will measure zero.
- **Avoid `Emulation.setDeviceMetricsOverride` / `setTouchEmulationEnabled`** on
  a profile you want to keep using — they can poison input delivery for the rest
  of the browser session. Restart Chrome instead.
- **The spinner is what a driver should wait on**, not a fixed sleep: read
  `#busy`'s class, and wait for it to come *on* first, since a pass that has not
  started looks exactly like one that has finished and the settle timer is
  400 ms. Give up on the wait-for-on after ~1.5 s: a pass that never runs is a
  legitimate outcome of the `WORTH_REDOING` guard.
- Screenshot byte size is a decent proxy for "did anything render": a black
  screen compresses to ~20 KB, a spectrogram to 1–7 MB. Reading the canvas
  in-page returns blank (`preserveDrawingBuffer` is off) — use
  `Page.captureScreenshot`, or `view.tile()`.
- Measure blocked main thread from *inside* the page — a `setInterval` recording
  `performance.now()`, then the largest gap between ticks. Polling with
  `Runtime.evaluate` measures nothing, because CDP evaluates are served even
  while the renderer is in a long task; worse, an evaluate that *clears* the
  tick array is itself served mid-block and wipes the evidence.

Blocked main thread on the M4, longest gap between ticks, three runs of each
build on the same synthetic take and the same zoom sequence. The last two
columns are a matched pair measured together; the first is the old note's figure
for when the analysis still ran on the main thread, and is here only for scale.

| | main thread, before the pool | single scale | multiscale |
|---|---|---|---|
| first analysis | 6.5 s | 0.42–0.44 s | 0.39–0.40 s |
| settle at 5× | 4.8 s | 0.55–0.65 s | 0.42–0.76 s |
| settle at 24× | 4.0 s | 0.17–0.18 s | 0.13–0.14 s |
| settle at 116× | 6.9 s | 0.12–0.15 s | 0.09–0.11 s |
| settle at 256× | 10.3 s | 0.10–0.12 s | 0.09–0.12 s |

**Multiscale cost no responsiveness**, which is worth knowing because it sounds
as though it should: the same total cell budget is spread over three smaller
grids, so the cells cost what they always did, and the three ridge maps are
walked one per worker in parallel. What is left of the block is the commit —
reallocating and refilling the vertex buffer, and on a first analysis
`calibrate`'s `readPixels`, which stalls until the GPU has finished accumulating
the whole cloud. Panning stays at 120 fps throughout, because the draw only ever
touches the visible stretch.

Sanity numbers on a ~1.2 s take at a 2800×1414 canvas: three scales at 256 /
1024 / 4096 samples, full-view screenshot ~6.0 MB, 53% of pixels lit, mean luma
132 over the lit ones. Export is 19901×10050 in 3.7 s.

## Known limitations

- **The full view is no longer saturated.** Splitting the budget three ways
  costs *coverage* rather than exposure: lit pixels fall 56.5% to 52.7% while
  the lit ones are slightly brighter and exactly as saturated. See the
  `MAX_CELLS` comment — 64e6 more than recovers it, at a 2.0 s first-analysis
  block and a 1.28 GB vertex buffer, and that is Andrew's call rather than one
  to take quietly.
- **`F_MIN = 60` is now a choice rather than a limit.** It was the floor of a
  25 ms window; the 85 ms one measures phase honestly down to about 18 Hz, and
  the arena already hands it the whole of the bottom of the picture. Lowering
  `F_MIN` would open up a band the picture has never shown. It was left alone
  because it is the bottom of the *log axis* too, so dropping it compresses
  everything above it, and that is an aesthetic call rather than a technical
  one — Andrew's to make.
- **The scales' budgets are fixed, not spent where they would do most good.**
  `SCALE_WEIGHTS` divides the cells the same way at every viewport, and the only
  thing that varies is that a scale whose band is entirely above the viewport
  drops out. The arena already knows which window suits the region on screen, so
  the budget could follow the share — deep zoom into a tone would then be nearly
  as detailed as the single-scale build was. It was left alone because a budget
  that shrinks on zoom can make a scale *coarser* as you zoom in, which is the
  one thing the picture must never do, and getting that right needs more care
  than the gain justified today.
- **Ridges are tracked, but segments are still drawn independently.** `ridge.js`
  follows each chain and tells every cell how far the ridge under it runs, but
  the *geometry* is unchanged: a stroke points along its own measured direction
  and is as long as the gap to where its neighbour ought to be, rather than
  ending exactly where the neighbour actually is. Drawing the chains as real
  polylines is the piece left undone; the visible gain looks small, because
  where the gap is big enough for the difference to show, coherence is high
  enough that the two nearly agree.
- **A click reads brighter than it used to, by up to 6 dB.** Tones and noise are
  scale-invariant under `reassign.js`'s normalisation — an amplitude is an
  amplitude at any window length — but an impulse is a spectral *density*, and
  density depends on how much time the window spread it over. So when the short
  window wins a transient's share, that transient draws about four times as
  bright as the base window drew it. This is inherent to the duality rather than
  a bug, and correcting it would mean deciding per cell whether it was tonal or
  impulsive and scaling power by the answer — which is exactly the thing
  "brightness is amplitude" forbids.
- Where two components fall inside one analysis window, reassignment places
  their energy at a weighted average of the two. This is the technique's known
  failure mode and shows up as looping filaments between close harmonics.
  Coherence suppresses most of it and multiscale now moves much of what is left
  to a window that resolves the pair — but the *real* ridges of two close
  components also lose some coherence during beats, because their estimates
  genuinely wobble. That is the physics, not a bug.
- **A superseded pass still has to finish.** Gesture again while one is running
  and the new one queues behind it, because a worker in the middle of a region
  cannot be interrupted without a `SharedArrayBuffer` and the page is not
  cross-origin isolated. In practice one gesture burst fires one pass.
- **The commit still blocks**, 0.4–0.6 s on the first analysis of a recording
  and 0.1–0.6 s on a settle. Spreading the upload over several tasks would mean
  drawing out of a buffer being overwritten, which needs a second gigabyte.
- The picture arrives in two stages past ~2×: the cloud in hand is re-projected
  instantly, then the refined pass lands about a second later. Anything reading
  a screenshot has to wait for the second one or it will conclude the picture is
  empty.
- Useful depth runs past 250×, and what limits it is the *frequency* sampling
  rather than the time sampling. Past ~500× the worst gap is a hundred pixels
  again and the picture genuinely thins out, which is still worth seeing.
- Longer recordings get fewer frames per second of audio, since `MAX_CELLS` is
  fixed. Zooming in recovers the detail.
- Peak memory is roughly 1 GB of GPU vertex buffer, up to 250 MB of
  `Float32Array` for the coherence ring per region in flight and about 1 GB
  across the pool, up to 930 MB of staged cells, and up to 800 MB of 2D canvas
  while an export encodes. The ridge maps are now three rather than one and the
  longest is the largest: ~64 MB for the 32 s the ring can hold, against 12 MB
  before, plus the arena. Nothing here is sized to survive a phone.
- The export is one PNG on a 2D canvas, so it is bounded by the browser's canvas
  area limit rather than the GPU's — hence `MAX_EXPORT_PIXELS`.
- Untested against a real microphone by Claude in every session; the live mic
  path always runs first for Andrew. Say so rather than implying otherwise.
