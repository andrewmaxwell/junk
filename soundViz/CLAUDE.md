# soundViz

Hold anywhere to record from the microphone; on release the sound is drawn
full-screen as a **reassigned spectrogram**. Scroll or pinch to zoom in on any
part of it, `S` to save it as a large PNG. Served from
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

## Files

| file | role |
|---|---|
| `index.html` | canvas, hint/status chrome, touch CSS. Whole screen is the button. |
| `main.js` | recording state machine, gesture wiring, PNG save, status text |
| `recorder.js` | persistent mic, ring buffer, take start/end |
| `capture-processor.js` | AudioWorklet, posts raw blocks to the main thread |
| `reassign.js` | the analysis: STFT → cloud of reassigned cells |
| `fft.js` | iterative radix-2 complex FFT |
| `render.js` | picks the sampling grid, drives `reassign` → `glview`, tiles the export |
| `glview.js` | WebGL2 renderer: accumulate → measure background → colour |
| `zoom.js` | viewport model (samples × Hz) and gesture handling |

Dependency direction: `main → {recorder, render, zoom}`, `render → {reassign,
glview}`, `reassign → fft`. Nothing else imports anything.

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
- **coherence** = how much the neighbouring estimates corroborate this cell,
  0..1. Measured, not styled — derivation below. It decides how much stroke a
  cell earns and how vivid it draws, which is what keeps the interference
  residue from posing as signal.
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
those bins where they were); along time it is `COHERENCE_REACH = 64` samples
away whatever the hop, which is why frames pass through a ring and are emitted
`D = 64/hop` frames behind the analysis.

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

Together these mean a second pass reads as detail arriving, not as a different
picture.

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
half a window of its centre — so the visible cells are one contiguous range.
Drawing 16 M cells at full view costs 93 ms; at 100× it costs 5 ms, because
99% of them are never submitted. Without this a cloud this size would be
unpannable.

**Empty pixels are not quiet pixels.** The background percentile ignores
unsampled pixels; `MIN_SAMPLED` guards bands with too little to measure.

**The colour ramp climbs monotonically in brightness.** MATLAB `jet` runs bright
at cyan, dim at blue-green, bright again at yellow, so a filament of constant
strength appears to break into beads. This single change did more for the
Mythbusters look than any signal processing.

**Do not put anything the app needs behind `requestAnimationFrame`.** The
status line is painted before the analysis blocks by deferring through a timer,
and it was a frame callback first — but a backgrounded tab fires no frame
callbacks at all, so a take made just before switching away sat unanalysed at
"analysing…" until you came back. This bit the CDP harness before it could bite
Andrew, because an occluded window is backgrounded too.

**The mic stays open with a ring buffer.** A freshly opened capture stream
delivers ~200 ms of silence and a startup click. `WARMUP_SEC` discards it;
`LEAD_TRIM` skips forward past the sound of the button press itself.

**`beginTake(lagMs)` reaches back by the real press time.** The analysis blocks
the main thread for over a second, so a press landing mid-pass is not seen until
it finishes, by which point its audio is already in the ring. Event timestamps
recover it; without this the take comes out empty.

## Parameters worth knowing

`reassign.js`
- `COHERENCE_SIGMA = 0.15` — how hard neighbour disagreement is punished.
  Smaller kills more dust but starts to gate the real ridges of close
  harmonics, whose estimates genuinely wobble during beats (their combined
  residual sits around 0.19 against ~0.005 for a lone tone).
- `COHERENCE_REACH = 64` samples — the cross-frame probe distance. Part of the
  zoom invariant: changing it recolours every recording.

`render.js`
- `WIN_MS = 25` — analysis window duration. Sets the character of the whole
  picture. Larger separates harmonics better, smaller sharpens transients.
  Also why `F_MIN = 60` is a floor, not an aesthetic: below ~1.5 cycles per
  window the phase estimates are garbage, and 25 ms holds 1.5 cycles at 60 Hz.
- `MAX_CELLS = 16e6` — 320 MB of GPU buffer (20 bytes a cell), ~1.5 s of
  analysis, ~100 ms for a full-view draw. Raising it costs all three roughly
  linearly.
- `TARGET_GAP = 0.6` px — how finely time is sampled before the remaining budget
  goes to padding.
- `ANALYSIS_MARGIN = 0.35` — analysed beyond the viewport, once the budget stops
  covering the whole recording.
- `WORTH_REDOING = 0.7` — how much finer a second pass has to be to be worth
  running at all.
- `EXPORT_SCALE = 4`, `MAX_EXPORT_PIXELS = 120e6` — the `S` key. A 2800×1414
  canvas exports 11200×5656 in 18 tiles, about 2 s and 90 MB of PNG.

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

`recorder.js`
- `FADE_SEC = 0.004` — raised-cosine at each end of a take. A hard cut is a
  step and a step is broadband; without this every recording had a bright
  vertical curtain down its edges that was never in the sound.

`main.js`
- `MIN_SPAN = 24` samples, `MIN_RATIO = 1.001` — the zoom stops, in both axes,
  both far past what the analysis can resolve. Andrew asked for them to be
  removed; past a few hundred × the picture simply thins out, which is a thing
  worth being able to see. `MIN_RATIO` in particular: without it the frequency
  axis stopped zooming at a 1.5:1 ratio while time kept going, and the picture
  stretched sideways.

## Rendering pipeline (`glview.js`)

1. **accumulate** — every visible cell drawn as an antialiased quad along its
   own ridge, additively blended into an `RGBA32F` framebuffer (falls back to
   `RGBA16F` without `EXT_float_blend`). One instance per cell, four vertices.
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

- **`Page.bringToFront` before driving anything.** An occluded tab reports
  `document.hidden`, and Chrome then delivers no input events and fires no
  `requestAnimationFrame` — every script hangs or silently does nothing.
- **`getUserMedia` does not work in headless Chrome** under any flag
  combination. Monkey-patch it via `Page.addScriptToEvaluateOnNewDocument` to
  return a `MediaStreamAudioDestinationNode` stream, so everything below the mic
  still runs. A speech-like source (buzz with vibrato, moving formants, breath
  noise, a few transients) exercises far more of the picture than a pure tone.
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

Sanity numbers on a 0.95 s take at a 2800×1414 canvas: `hop 16, fftSize 8192,
2850 frames, 11.7 M cells`, analysis ~1.3 s, draw 93 ms at full view and 5 ms
at 100×.

## Known limitations

- **Segments are independent estimates and are not linked into curves.** They
  merge visually when the cell gap is sub-pixel, but nothing tracks a partial
  across frames. Real ridge/partial tracking (McAulay–Quatieri style) would let
  them be drawn as actual polylines, with length then free to mean something.
  Still the most promising unexplored direction. The coherence gate removed
  most of the deep-zoom combs, but a *per-cell* test has a ceiling it cannot
  pass: white noise's reassignment field is self-correlated over roughly a
  window, so its most coherent tail (p90 ≈ 0.8) survives any local test and
  still chains into faint filaments at extreme zoom. Only tracking whole
  ridges can tell those from signal.
- Where two components fall inside one analysis window, reassignment places
  their energy at a weighted average of the two. This is the technique's known
  failure mode and shows up as the looping filaments between close harmonics.
  Coherence now suppresses most of it (the loops fail the cross-frame test),
  at a cost worth knowing: the *real* ridges of two close components also lose
  some coherence during beats, because their estimates genuinely wobble — that
  is the physics, not a bug.
- The other ideas from the 2026-08 ChatGPT review that were judged and
  deliberately *not* taken: worker-based analysis (buys responsiveness, not
  picture, and Andrew ranked picture first), occupancy-based noise floor
  (risks a tuned system for a corner case), frequency-dependent cell
  thresholds (drops quiet detail), F_MIN = 20 Hz (garbage below ~60 Hz at a
  25 ms window). Multiscale analysis — several window lengths analysed up
  front, finer scales *adding* structure at depth without repainting coarser
  ones — is the big worthwhile one left, alongside ridge linking.
- The picture arrives in two stages past ~2×: the cloud in hand is re-projected
  instantly, then the refined pass lands about a second later. Measured on a
  ~1 s take — 40×: 503 KB of screenshot immediately, 2034 KB once settled;
  196×: 83 → 239 KB. Anything that reads a screenshot has to wait for the
  second one or it will conclude the picture is empty.
- Useful depth runs to roughly 150–200×. Past that the hop is already 1 and the
  analysed span holds only a few dozen frames: at 565× the settled picture is
  32 KB, i.e. nothing. Working as intended, and worth seeing.
- Longer recordings get fewer frames per second of audio, since `MAX_CELLS` is
  fixed. Zooming in recovers the detail.
- The export is one PNG on a 2D canvas, so it is bounded by the browser's canvas
  area limit, not the GPU's — hence `MAX_EXPORT_PIXELS`.
- Untested against a real microphone by Claude in every session; the live mic
  path always runs first for Andrew. Say so rather than implying otherwise.
