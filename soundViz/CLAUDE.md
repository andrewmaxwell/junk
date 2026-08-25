# soundViz

Hold anywhere to record from the microphone; on release the sound is drawn
full-screen as a **reassigned spectrogram**. Scroll or pinch to zoom, drag to
pan, tap a point to read off what is there, `P` to hear the part you are looking
at, `S` to save it as a large PNG. Served from `http://localhost:3000/soundViz/`.
No build step, no dependencies — plain ES modules loaded by `index.html`.

The look being chased is the MATLAB spectrograms from Mythbusters: fine bright
filaments on black, not fuzzy blobs.

**The source files carry their own reasoning.** Every constant is declared
beside a comment saying what it costs and what was measured against it. This
file is the map, not the territory: read it to orient, then read the file. What
lives here is what no single file owns — the standing requirements, the
invariants that span several files, and the list of things not to undo.

## Priorities

Andrew's stated order: **detail and aesthetics first, UI responsiveness
second.** Spending a second of analysis to make the picture better is the right
trade. Do not quietly optimise for frame rate at the cost of image quality.

The second standing requirement: **the picture must not change when you zoom.**
Zooming may add detail; it may not restate the picture in different terms.
Several things below exist only to hold that line.

**The target is one machine: Andrew's M4 MacBook Pro.** He tried it on a phone,
it crashed during analysis, and his answer was "remove anything specifically for
mobile and turn up the knobs for maximum quality". The budgets assume ~16 GB of
unified memory and a GPU that will take a one-gigabyte vertex buffer, and **a
phone is expected to crash**. Do not lower them to make some other device work;
that is undoing the decision, not fixing a bug. The touch handling in `zoom.js`
stays because it costs nothing and a trackpad uses some of it.

## Files

| file                                                           | what it owns                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| `main.js`                                                      | app state, gestures to viewports, the readout, save and playback |
| `render.js`                                                    | picks the grids, runs the pool, owns every budget                |
| `reassign.js`                                                  | the STFT and the reassignment — one region of one scale          |
| `ridge.js`                                                     | ridge chains, the support gate, the share arena                  |
| `glview.js`                                                    | WebGL2: strokes, accumulation, exposure, colour, tiled export    |
| `zoom.js`                                                      | viewport model (samples x Hz), gestures, hold-vs-drag            |
| `analysis-worker.js`                                           | one pool thread; owns nothing, decides nothing                   |
| `fft.js`, `recorder.js`, `playback.js`, `capture-processor.js` | as named                                                         |

Dependency direction: `main -> {recorder, render, zoom, playback}`,
`render -> {ridge, glview}`, workers -> `{reassign, ridge}`. Nothing points back.

## What a single drawn segment means

One cell of the reassigned spectrogram, drawn as a short oriented stroke:

- **position** — the instant and frequency the _phase_ says the energy belongs
  at, not the centre of the bin it landed in. This is the whole technique.
- **brightness** — amplitude above the recording's own background in that
  frequency band. Brightness is amplitude and nothing else is allowed to
  multiply it. The one exception is the share arena, which divides one quantity
  between several descriptions of it and sums to one.
- **direction and length** — the ridge direction measured from the signal, drawn
  long enough to bridge the gap to where its neighbour ought to be. Length is a
  _drawing_ decision and never meant anything about the signal.
- **saturation** — coherence: whether neighbours corroborate this cell, times
  whether it sits on a ridge that goes anywhere.
- **hue** — chirp rate. Rising sweeps one way, falling the other, steady tones
  and clicks in the middle.

## The mathematics, in brief

Each frame takes three transforms' worth of information from two: the windowed
transform `X`, the time-ramped one `X_tw`, and the window-derivative one `X_dw`,
with the first two packed into one complex FFT.

- **Time offset** `Re{X_tw / X}` — displacement in samples from the window centre.
- **Frequency offset** `-Im{X_dw / X}` — displacement in Hz from the bin centre.
- **Chirp rate** falls out of the same pair: for a locally linear chirp,
  `Re{X_dw/X} = q * Im{X_tw/X}`, so the ridge direction costs no extra
  transform. The two are carried as a _pair_ rather than divided, because a
  steady tone has zero rise and a click has zero run.

**Coherence** asks whether a cell's neighbours corroborate it: the residual of
the neighbour displacement perpendicular to this cell's own direction, through a
Gaussian. Two neighbours, and both must pass — the neighbouring _bin_ alone
acquits the looping filaments reassignment hangs between two components sharing
a window, and the neighbouring _instant_ is what convicts them. Both comparisons
are pinned to **absolute** distances — one unpadded bin, `REACH` samples —
so the answer does not depend on which pass computed it.

**The support gate** (`ridge.js`) follows ridge chains and asks whether a cell
belongs to something that lasts. Two neighbours is as far as a per-cell test can
see, and the reassignment field of white noise is smooth over about one window,
so its most coherent cells pass the per-cell test as convincingly as a partial
does. Support gates coherence, **never power**.

**The share arena** (`ridge.js`) divides the energy between the window lengths,
on a grid of absolute instant against `sqrt(f)`. Each window is a complete
account of the sound, so drawing all three at full power would treble the
brightness. The shares sum to one, so the total is untouched.

## How zooming works

There is no master image. The **cloud of cells is the master** — resolution
independent, so a viewport is projected exactly rather than interpolated. A
raster large enough for 100x zoom would be hundreds of gigapixels.

Detail is quadratic in zoom, so no single pass can serve every zoom. The
compromise:

**One pass covers the whole recording whenever the budget allows.** On a ~1 s
take that holds to about 2x; inside it, panning and zooming recompute nothing.

**A pass analyses a band, not the spectrum.** Time was always clipped to the
viewport; frequency was not, and that was the largest waste in the analysis. At
a 221x zoom — 2.57 to 2.64 kHz of 24 kHz — **99.8% of every cell computed landed
off screen**, so `room` was starved by ~580x and `plan()` spent the budget
coarsening the hop and capping the padding to afford bins nobody could see. That
is why the picture used to _thin out_ as it was zoomed into.

**The grids nest.** The hop is a power of two anchored to an absolute multiple of
itself; `fftSize` is `winLen` times a power of two, and zero padding leaves the
coarser grid's bins exactly where they were. The band is quantised to whole
unpadded bins and multiplied up by the padding, so it nests the same way. A
finer pass is therefore a strict _superset_: it adds cells and never moves the
ones on screen.

**Four things are measured once per recording**, and each holds the zoom
invariant:

| measured once                   | why not per viewport                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| the exposure (`view.calibrate`) | at 100x the faint end of what is on screen has nothing to do with the noise floor — measured, a 40 dB swing that showed as the colours lurching |
| the ridge maps                  | at 100x the analysis covers a few hundred samples, and asking whether ridges persist across that fails everything, including real partials      |
| the share arena                 | which window suits a stretch of sound is a property of the sound                                                                                |
| the window lengths              | `WIN_MS` was once a fraction of the visible span, so every zoom level was a _different analysis_ rather than a closer look at one               |

Verified: re-emitting a cloud at half the hop and twice the padding reproduced
the support of **100%** of cells, and a band pass reproduces a full-spectrum pass
**bit for bit**.

## Where the analysis runs

Nothing expensive happens on the main thread. `render.js` picks the grids and
deals regions out to a pool of workers; a region computes `D` frames beyond each
of its ends so cross-frame coherence sees the neighbours a single call would
have given it, and one unpadded bin beyond each end of its band for the same
reason in frequency. A region boundary and a band edge are both invisible in the
result.

**Passes are discarded, not cancelled.** A worker inside a region cannot be
interrupted without a `SharedArrayBuffer`, and the page is not cross-origin
isolated, so a superseded pass runs to completion and its result is dropped on a
generation check.

**The `WORTH_REDOING` guard asks about the pass in flight**, not only the cloud
in hand — otherwise it starts a second identical pass behind the first.

## Decisions that were expensive to learn

Each was a visible bug first. The detail is in the comment beside the code; this
is the index.

- **A cell's power must not depend on the hop.** Halving the hop doubles the
  cells along a ridge but also halves the gap, and the renderer already divides
  by how many strokes cover a pixel. Dividing again made the picture fade every
  time it was sampled more finely. _This was the main cause of "the image changes
  when I zoom"._
- **Strokes are instanced quads, not point sprites.** A sprite is square, capped
  by `ALIASED_POINT_SIZE_RANGE`, and discarded whole once its centre leaves the
  viewport — which would tear the tiled export apart at every boundary.
- **Stroke length is the on-screen gap to the neighbouring cell**, per cell in
  the vertex shader. A constant pixel length breaks into confetti as soon as the
  gap outgrows it.
- **Only coherence earns stroke length.** The gap is scaled by
  `smoothstep(0.15, 0.6, conf)`, and only near-perfect coherence may draw a
  genuinely long stroke (`pow(conf, 8)` in the exponent). Before this gate the
  deep zoom was solid spaghetti.
- **Ridge support gates coherence, never power.** A cell that turns out to sit on
  nothing keeps every bit of its energy and loses its length, its width and its
  say in the hue. Noise does not vanish, it stops pretending.
- **More detail meant more padding, not longer strokes.** A longer stroke
  extrapolates; more padding samples the reassignment field at more points, each
  placed by its own phase, nesting exactly with the coarser grid.
- **Zero padding is most of the FFT, and free to skip.** After the bit-reversal
  permutation the non-zero entries sit at multiples of `pad`, and every butterfly
  below `size = 2*pad` combines a value with a zero. `FFT.transform(re, im, nz)`
  skips them **bit-identically**; 2.34x at the 262144 the deepest zooms use.
- **`Math.hypot` and `Math.exp` cost a third of a second each per pass.** Both
  are once per cell across tens of millions. A tabulated Gaussian rather than an
  approximation, on purpose: a re-emitted cell must get back the coherence it had.
- **Once a pass emits a band, cells stop being a proxy for time.** A band is
  cheap in cells and _exactly as expensive_ in transforms, because a zero-padded
  FFT computes the whole spectrum whatever you keep. Budgeting cells alone then
  buys padding as though it were free. `MAX_COST` is the second budget;
  `MAX_CELLS` stays as the memory bound, and both hold.
- **`plan()` breaks ties toward the finer grid.** The score is
  `max(gapT, gapF)`, so once the hop is at its one-sample floor every padding
  above the crossover ties — and a strict `<` keeps the coarsest. At 221x that
  was `fftSize` 131072 against 262144: half the frequency sampling, for nothing.
- **A scale the arena gives nothing is not worth analysing.** Its cells are
  computed, uploaded and drawn multiplied by a share of zero. Measured on a tonal
  take, the short window drew **0.0% of the light for 51-58% of the pass** at
  every zoomed view. `SCALE_FLOOR` drops it. Only ever drops, never re-weights,
  so nothing gets coarser as the zoom goes in.

## Parameters worth knowing

Every one of these has a comment saying what was measured. These are the ones
that get reached for.

- **`MAX_COST = 84e6`** (`render.js`) — the _time_ budget: cells emitted plus
  `XFM_COST` times the transforms. Sized so the full view plans as it did when
  cells were the only budget. **This is the knob to raise**, not `MAX_CELLS`;
  168e6 buys a visibly finer 30x and 92x for about twice the wait, and past
  240e6 nothing at depth improves because the hop is at its floor.
- **`MAX_CELLS = 48e6`** (`render.js`) — the _memory_ budget, 960 MB of GPU
  buffer at 20 bytes a cell. Binds at the full view and essentially nowhere else
  now that a pass emits a band.
- **`FREQ_MARGIN = 0.35`, `LOBE_BINS = 2`** (`render.js`) — how far past the
  viewport a pass analyses in frequency. The first is the analogue of
  `ANALYSIS_MARGIN`, a share of the visible _log_ span. The second covers
  reassignment moving a cell across the band edge, and is in _unpadded_ bins —
  at `winLen` 256, four of them was 750 Hz against a 70 Hz viewport. Measured: a
  margin of 2 captures 100.000% of the power landing in the viewport.
- **`SCALE_FLOOR = 0.01`** (`render.js`) — the share of on-screen light below
  which a scale is dropped from a pass. It drops out of a _pass_, not the
  recording: the ridge maps and the arena are built for every scale whatever the
  viewport, so panning onto a plosive brings the short window straight back.
- **`SCALE_STEPS = [0.25, 1, 2]`, `WIN_MS = 25`** (`render.js`) — the window
  lengths. The long step is 2 and not 4 because past ~50 ms speech intonation
  moves a partial off its own measured direction, the chains break, and the gate
  correctly disbelieves it. See the table in the comment.
- **`MAX_FFT = 262144`** (`render.js`) — how far zero padding may go. Not a
  resolution limit; how finely the reassignment field is _sampled_.
- **`REACH = 64` samples** (`ridge.js`) — the distance corroboration is asked
  over, and the ridge maps' and arena's frame spacing. Part of the zoom
  invariant: changing it recolours every recording.
- **`SUPPORT_LO = 1.5`, `SUPPORT_HI = 6`** (`ridge.js`) — resolution cells of
  chain, from nothing believed to fully believed. White noise's chains die at
  about one.
- **`COHERENCE_SIGMA = 0.15`** (`reassign.js`) — how hard neighbour disagreement
  is punished. Smaller kills more dust but gates the real ridges of close
  harmonics, whose estimates genuinely wobble during beats.
- **`MAX_DPR = 2`** (`render.js`) — the display's own ratio. Rendering above it
  makes the picture _worse_: `TARGET_GAP` is in device pixels, so a higher ratio
  spends the budget sampling time more finely and starves the padding.
- **`HUE_GAIN = 0.7` rad, `SAT_FLOOR = 0.35`** (`glview.js`) — keep the gain
  mild; push it and amplitude stops being legible.
- **`BACKGROUND_PERCENTILE = 5`, `MIN_RANGE = 12`, `CONTRAST_RANGE = 36`**
  (`glview.js`) — the exposure. Tuned together by eye; changing one alone will
  look wrong.

## Rendering pipeline (`glview.js`)

WebGL2 with `EXT_color_buffer_float` required; there is no CPU fallback — it was
removed deliberately, it could not do interactive zoom, and it was 236 lines that
had to be kept in step with the shaders.

1. **skip** — if the buffer already holds this exact viewport, nothing runs.
2. **accumulate** — every visible cell as an antialiased quad along its own
   ridge, additively blended into `RGBA32F` (`RGBA16F` without
   `EXT_float_blend`). One instanced draw per region per scale, hop and bin
   spacing reset between scales. R accumulates power, G power·conf·hueDrive, A
   power·conf; the clear is `(0,0,0,0)` because **alpha is data**.
3. **decimate** — a small point-sampled copy read back so the CPU can measure the
   background per band. Only during `calibrate()`, not per frame.
4. **present** — dB, background subtraction, colour ramp; hue rotated about the
   grey axis by the pixel's mean coherent chirp drive, saturation pulled toward
   grey by 1 − mean coherence.

## Testing

There is no test runner. Verification is by driving real Chrome over CDP with
Node's built-in `WebSocket`, plus things checkable in Node alone. Scripts live in
the session scratchpad, not the repo; recreate as needed.

```
chrome --remote-debugging-port=9223 --user-data-dir=/tmp/prof \
       --use-fake-ui-for-media-stream --window-size=1400,850 about:blank
```

**Checkable without a browser**, and all worth rebuilding whenever the analysis
changes:

- Splitting a grid into 2, 3, 5, 8 and 16 regions must reproduce a single call
  **bit for bit**, at every window length, banded and full-spectrum. That is the
  guarantee the whole pool rests on.
- A cell emitted inside a band must be **bit-identical** to the same cell emitted
  at full spectrum. Cells come out in bin order, so the band's run appears inside
  the full run at one contiguous offset — match on _position_, not on `(t, f)`:
  on a strong tone many bins reassign onto coordinates equal to the last bit, and
  a `(t, f)` match silently pairs the wrong cells. Check the bottom edge, the top
  edge, a band one unpadded bin wide, and the degenerate whole-spectrum band.
- The shares must sum to 255 in every live arena cell, and a scale that saw no
  power must take exactly zero.
- One frame of a steady tone must come to the same total at every window length
  unweighted, and the share-weighted totals must sum back to it. That is
  "brightness is amplitude" stated as an assertion.

Driving the real thing:

- **`Page.bringToFront` before anything**, and check `document.hidden`. An
  occluded tab delivers no input and fires no `requestAnimationFrame`, and every
  script silently does nothing. The tell is a "longest block" of exactly 1005 ms,
  which is a background tab's `setInterval` throttle.
- **`getUserMedia` does not work in headless Chrome** under any flag. Patch it
  via `Page.addScriptToEvaluateOnNewDocument` to return a
  `MediaStreamAudioDestinationNode` stream, and **synthesise the source when the
  patch is injected**, not inside the patched call — otherwise the recording is
  shifted a different amount every run, which is invisible at full view and
  changes the picture completely at 100x.
- **Use a stationary source for any A/B.** Constant `f0`, constant formants,
  constant level. Then the loop phase at record time cannot change what a given
  viewport contains, and both builds can be driven to the same viewport from a
  fixed anchor and compared. With a non-stationary source the same wheel
  sequence lands on different content and the comparison is worthless.
- **Deep-zoom comparison needs an anchor with something under it.** Past ~50x the
  visible band is a few per cent wide, so a fixed anchor walks off whatever it
  was aimed at and _every_ build shows an empty screen — which looks exactly like
  a regression. Re-pick the anchor from the picture on screen, or drive both
  builds to the same named viewport and check the status line agrees.
- **Judge by distribution statistics, and know what they mean.** Lit-pixel
  fraction is a _coverage_ measure: more cells means shorter strokes each, so
  coverage can fall while the picture gets better. Mean luma over lit pixels
  rising while lit falls is light concentrating into finer filaments, which is
  the goal.

## What is the sound and what is the analysis

Worth being able to answer, because a deep zoom grows a lattice that looks like
signal and is not.

- **The dotted texture and the regular rows of dots** are the sampling grid.
  Every dot is one STFT cell; how far apart they land is `plan()`'s business.
  Measured at w = 1900: 1.2 px at the full view, 3.6 px at 30x, 6.8 px at 92x,
  13.2 px at 221x. Past about 20x the cells stop touching.
- **Looping filaments between close harmonics** are reassignment's known failure
  mode: two components inside one window put their energy at a weighted average.
  Coherence suppresses most of it and multiscale moves much of the rest to a
  window that resolves the pair.
- **A speckle of dots where a filament used to be** is the support gate. The same
  energy that was smeared along a confident-looking filament lands as speckle,
  because a stroke that shortens to a point concentrates what it carried.
- **The stroke lengths, always.** Length is the distance to where the neighbour
  ought to be, along the direction this cell measured.

## Known limitations

- **Past about 100x it is the _time_ sampling that limits the picture, and
  nothing here can fix it.** This used to be the other way round; the band
  inverted it. Frequency sampling now runs to `MAX_FFT` cheaply, so at 221x the
  frequency gap is 3.9 px while the time gap is 13.2. The hop is at 1 sample and
  cannot go below it — 3.0 ms of a 48 kHz recording is 144 samples, and a screen
  1900 px wide cannot be given more frames than there are samples under it.
  Getting past this means interpolating the recording, which is legitimate by
  Shannon and symmetric with the padding argument, but costs U^2 in transforms
  done naively and needs a spike before it is worth committing to.
- **Drawing ridge chains as real polylines is not worth doing**, and this used to
  be listed here as the largest remaining accuracy item. The reasoning was that a
  stroke extrapolates along its own direction rather than ending where its
  neighbour actually is, and that at depth the gap is tens of pixels. Measured:
  take each stroke's far end, find the nearest real cell, and take the
  perpendicular offset from the ray it was drawn along — **0.20 / 0.25 / 0.39 px**
  at 30x / 92x / 221x on a steady take, 0.21 / 0.27 / 0.42 gliding, 0.25 / 0.34 /
  0.57 with vibrato, and **0.0% of drawn power has a far end landing on nothing**.
  The coherence gate was doing the polyline's job all along: only cells on
  locally straight ridges ever earn a long stroke. Two more floats per cell and a
  new vertex shader would buy a third of a pixel.
- **`F_MIN = 60` is a choice, not a limit.** It was the floor of a 25 ms window;
  the 43 ms one measures phase honestly to about 35 Hz, and the arena already
  hands it the bottom of the picture. Lowering it would open up a band the
  picture has never shown — but it is also the bottom of the _log axis_, so
  dropping it compresses everything above. Andrew's call, not one to take
  quietly.
- **A click reads brighter than it used to, by up to 6 dB.** Tones and noise are
  scale-invariant under the normalisation, but an impulse is a spectral _density_
  and density depends on how much time the window spread it over. Inherent to the
  duality; correcting it would mean deciding per cell whether it was tonal or
  impulsive, which is exactly what "brightness is amplitude" forbids.
- **No window longer than about 50 ms is usable on speech**, which puts a hard
  floor under how finely harmonics can be separated. The limit is not the
  transform, it is that intonation moves a partial off its own measured direction
  over a longer window.
- **Resizing the window while zoomed re-measures the exposure from a partial
  cloud.** The resize handler passes `calibrate: true` at whatever viewport is
  current, and `view.calibrate` reads `fullSpan(rec)` out of a cloud that only
  covers the analysed stretch. It degrades rather than breaks — unsampled bands
  are marked dead and borrow the nearest measured level. The fix is to
  recalibrate only when the cloud covers the whole recording, but whether a
  resize should hold the old exposure is an aesthetic call, and the exposure is
  meant to be measured once per recording.
- **A superseded pass still has to finish**, and **the commit still blocks**
  (0.4-0.6 s on a first analysis, 0.1-0.6 s on a settle).
- The picture arrives in two stages past ~2x: the cloud in hand is re-projected
  instantly, then the refined pass lands about a second later. Anything reading a
  screenshot must wait for the second or it will conclude the picture is empty.
- Longer recordings get fewer frames per second of audio. Zooming in recovers it.
- Peak memory is ~1 GB of GPU vertex buffer, and the full view is now where it
  peaks: a zoomed pass stages a band, so 30x/92x/221x measured 589/781/645 MB
  before the band and 104/60/43 MB after. Add up to 250 MB of `Float32Array` per
  region in flight, and up to 800 MB of 2D canvas while an export encodes.
- The export is one PNG on a 2D canvas, so it is bounded by the browser's canvas
  area limit rather than the GPU's — hence `MAX_EXPORT_PIXELS`.
- Untested against a real microphone by Claude in every session; the live mic
  path always runs first for Andrew. Say so rather than implying otherwise.
