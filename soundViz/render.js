import {REACH, SHARE_ROWS, rowScaleFor} from './ridge.js';
import {createView} from './glview.js';

export const F_MIN = 60;

// Window duration is fixed in milliseconds and has nothing to do with the
// viewport. It sets the character of the analysis — how finely harmonics are
// separated, how sharply a transient reads.
const WIN_MS = 25;
const WIN_MIN = 256;
const WIN_MAX = 4096;

// Multiscale.
//
// One window length is one compromise between separating harmonics and placing
// transients, and no single choice is right for a whole recording. So the sound
// is analysed at several, all of them, up front — and the energy is divided
// between them by `ridge.js`'s share arena, so that the several clouds drawn on
// top of each other carry exactly the energy one of them would have.
//
// On a 48 kHz recording these come out at 5.3, 21 and 43 ms, and what each is
// for:
//
//   short  resolves events milliseconds apart — plosives, attacks, the
//          individual pulses of a buzz — where one window covering both of
//          them puts their energy at a weighted average of the two.
//   base   what the picture has always been analysed at, and still its spine.
//   long   resolves harmonics the base window cannot: its main lobe is 94 Hz
//          against the base's 188, and a male voice's harmonics are ~125 Hz
//          apart. Also three and a half cycles at 80 Hz instead of one and a
//          half, which is what opens up the bottom of the picture.
//
// **The long step is 2 and not 4, and that was measured rather than assumed.**
// The first version of this used 4 — an 85 ms window — on the reasoning that
// two scales a factor of two apart would be too alike to be worth the split.
// They are not, and 85 ms is past the useful range. A window only describes a
// partial while the partial is locally a linear chirp inside it, and speech
// intonation moves a 2 kHz harmonic more than three main lobes in 85 ms. The
// consequence is not that it draws the harmonic badly; it is that the ridge
// chains break, so the support gate disbelieves it and it draws nothing:
//
//   window   speech/noise separation   coherence on a harmonic   stroke earned
//   1024     15.3x                     0.68                     85%
//   2048      9.8x                     0.94                     99%
//   4096      2.6x                     0.27                     27%
//   8192      1.1x                     0.02                      1%
//
// At 4096 the chain test can barely tell speech from noise, so the threshold
// cannot simply be relaxed to let it back in — the gate is right to disbelieve
// it. Measured on the real thing at a matched viewport, moving 4 to 2 took the
// share of on-screen light that is fully corroborated from 86.7% to 94.0% at
// 256x and from 18.8% to 43.9% at the full view, raised the lit pixel count at
// 256x by 69%, and cost nothing in blocked main thread.
//
// The short step stays at 4: at 512 samples a window is longer than a glottal
// period but still cannot resolve harmonics, which is the worst of both and
// measured as such (41% of its energy on a harmonic, and coherence that does
// not distinguish a harmonic from the gap beside it).
//
// The base scale keeps twice the cell budget of either flank. It is the proven
// one, and halving it outright would be spending a certainty on a hope.
const SCALE_STEPS = [0.25, 1, 2];
const SCALE_WEIGHTS = [1, 2, 1];

// Below about this many cycles inside its window, a phase estimate is being
// read out of noise — which is the reasoning that used to put a floor under
// `F_MIN`, now applied per scale instead. A short window therefore does not bid
// for the bottom of the picture at all: at 48 kHz the 5.3 ms window says
// nothing below 281 Hz, the 21 ms one nothing below 70, and only the 43 ms one
// reaches `F_MIN` itself — with room to spare, since it is honest down to about
// 35 Hz. A window's fitness below its own floor is zero, so the arena hands the
// whole of the low end to the windows that can actually measure it.
//
// That spare room means `F_MIN = 60` is no longer a limit, only where the log
// axis starts. See the note in CLAUDE.md before lowering it: the cost is that
// everything above gets compressed, which is Andrew's call and not a free win.
const MIN_CYCLES = 1.5;

// How far zero padding may go. This is not a resolution limit — the window
// decides that — it is how finely the reassignment field is *sampled* along
// frequency, and deep into a zoom that sampling is what runs out first: the
// bin gap is the one `plan()` cannot close by spending frames on it. Measured
// on its own, at the 16e6 cell budget this file used to carry: the 256x view
// went from 61 cells and a scatter of dots to 168 and structure. With the
// budget below it is 702. It costs about 15% on the deepest settle and nothing
// at all elsewhere, because a pass is bounded by `MAX_CELLS` and the transform
// cost grows only with the *log* of `fftSize`.
const MAX_FFT = 262144;

// `reassign.js` holds 2·D+1 frames of `bins` cells in a ring so the coherence
// test can reach REACH samples either side, and D grows as the hop shrinks —
// so the deepest zoom, where the hop is 1 and the padding is at its greatest,
// is exactly where that product explodes. Left alone at the padding above it
// would reach 355 MB of Float32Array per pass. Grids are pushed to a coarser
// hop until the ring fits, the same trade `plan()` already makes for the cell
// budget.
//
// This only ever binds below about 200x, and what it buys there is real: at
// 256x, 9e6 puts 357 cells on screen and 18e6 puts 702, because the larger
// ring is what lets the hop stay at 1 alongside the maximum padding. Beyond
// 18e6 nothing changes — 36e6 picks exactly the same grids — so this is the
// ceiling rather than a compromise. Worst case ~250 MB of Float32Array per
// region in flight, held only for the length of a pass.
const MAX_RING_CELLS = 18e6;

// And the same figure again for the pool as a whole, since every region in
// flight holds a ring of its own. This one must never be spent by coarsening
// the hop — that is detail, and detail is what the budget above exists to buy
// — so it is spent by running *fewer regions at once* instead, which costs
// time and nothing else. It binds only at the deepest zooms, where the rings
// are large: eight of them at 256x measured a 4.0 GB renderer, which is enough
// to make the machine stall in ways that look like the app's fault.
//
// Spent as a limit on how many threads a pass may use at once, rather than on
// how many regions it is cut into. Those were the same thing while a pass was
// one grid; they are not once the pass is several scales dealt out to the pool
// together, because then the regions in flight can all be from the scale with
// the largest ring.
const MAX_POOL_RING_CELLS = 72e6;

// Cells cost 20 bytes each on the GPU and roughly 100 ns each to compute, so
// this is a memory budget and a "how long you wait after letting go of the
// button" budget at the same time. At this size the whole of a short recording
// fits in one pass, which is what lets most panning and zooming happen with
// nothing recomputed at all.
//
// Sized for a machine with memory to spare, and it is the strongest of all the
// detail knobs — it improves the picture at every zoom, which nothing else
// here does. Measured on an M4 MacBook Pro, blocked main thread and the mean
// fraction of its gap a stroke covers:
//
//   16M   2.3 s first pass, settles 1.2-2.4 s   fill 0.68 full view, 0.04 at 116x
//   48M   4.5 s first pass, settles 4.8-6.1 s   fill 0.99 full view, 0.08 at 116x
//   64M   4.9 s first pass, settles up to 11 s  no better at depth than 48M
//
// 48M is the knee: deep zoom has four times the cells 16M gave it and the draw
// still runs at 120 fps. Past it the wait doubles.
//
// Multiscale spends this budget three ways, so the base scale now works with
// 24M of it rather than 48M and no longer quite saturates the full view. What
// that costs is *coverage*, not exposure: measured on the same synthetic take,
// lit pixels fall 56.5% to 52.7% while the lit pixels themselves come out
// slightly brighter (mean luma over them 129.4 to 132.3) and exactly as
// saturated (mean chroma 0.365 to 0.368). Fewer pixels carry the picture; the
// ones that do are unchanged. Against that it buys the vertical structure the
// short window resolves, which the single-scale picture did not have at all.
//
// Raising this to 64e6 more than recovers the coverage — 60.3% lit, past what
// one scale ever managed — and is the obvious lever if the trade ever reads
// wrong. It is Andrew's to pull rather than one to take quietly: it costs a
// 2.0 s blocked main thread on the first analysis against 0.4 s, and a 1.28 GB
// vertex buffer on a page that already peaks at 2.4 GB.
const MAX_CELLS = 48000000;

// How far beyond the viewport, in frequency, a pass analyses — the exact
// analogue of `ANALYSIS_MARGIN`, and in the same units the axis is drawn in: a
// share of the visible *log* span, each way. At the full view that reaches past
// Nyquist and the band clamps to the whole spectrum, which is why nothing about
// the full view changes; at a deep zoom it is a few per cent of an octave, and
// that is the point.
const FREQ_MARGIN = 0.35;

// And a fixed margin on top, in unpadded bins of the window. Reassignment moves
// a cell in frequency, so a bin just outside the band can land just inside it,
// and a partial's main lobe is 2 unpadded bins wide either side.
//
// Measured rather than argued, because the raw displacement bound is alarming:
// a noise-floor cell, where the estimate is a ratio of two nearly-zero numbers,
// can be flung 360 unpadded bins. It carries no power, which is the thing that
// matters. Power landing inside the viewport, band pass against whole spectrum,
// on a take of chirp + two close tones + a click + noise: at 0 margin 97.4% /
// 99.9% / 100.0% for the three windows, and at 2 it is 100.000% for all three.
//
// Two rather than four, because this is in *unpadded* bins and a short window's
// are wide: at `winLen` 256 four of them is 750 Hz, which against the 70 Hz
// viewport of a 221x zoom had the short scale analysing 26.8 times the band it
// could draw into. Halving it halves that, and the measurement says nothing is
// lost.
const LOBE_BINS = 2;

// What one frame's transforms cost, expressed in cells, so that `plan()` can
// trade padding against frames in one currency.
//
// Before the band existed the two were the same quantity: a pass emitted
// `fftSize / 2` cells per frame, so bounding the cells bounded the transforms
// as a side effect and `MAX_CELLS` alone could steer. Once a pass emits a band
// the link is cut — a narrow band is cheap in cells and *exactly as expensive*
// in transforms, because a zero-padded FFT computes the whole spectrum whatever
// you keep of it. Budgeting cells alone would then buy padding as though it
// were free, and the deepest settles would run for half a minute.
//
// The shape is `fftSize * log2(winLen)` rather than `fftSize * log2(fftSize)`:
// the padding stages below `2 * pad` are a broadcast rather than arithmetic —
// see `FFT.transform` — so only the window's own stages cost anything. The
// constant comes from `OVERLAP_COST`'s measurement, that transforms are 0.42 of
// a frame's cost at the full view, where a frame is 4095 cells at `fftSize`
// 8192 and `winLen` 1024.
const XFM_COST = ((0.42 / 0.58) * 4095) / (8192 * Math.log2(1024));

// The time budget for a pass, in the same cells-per-frame currency: cells
// emitted plus `XFM_COST` times the transforms. `MAX_CELLS` stays alongside it
// as the *memory* budget — 20 bytes a cell on the GPU — and both must hold.
//
// Sized so the full view plans exactly as it did when cells were the only
// budget, which is what keeps the measurements above it honest: at 84e6 the
// full view is unchanged cell for cell, and every zoomed view comes out better
// at between 0.87 and 1.10 times the cost. Measured on the synthetic take, w =
// 1900, against the same viewports the screenshots were taken at:
//
//   view   worst on-screen gap    cells on screen    cost
//   1x     1.27 -> 1.27 px        24.5M -> 24.5M     1.00x
//   30x    7.20 -> 4.37 px        0.36M -> 0.90M     1.10x
//   92x   10.84 -> 6.82 px        0.15M -> 0.31M     0.87x
//   221x  15.59 -> 13.19 px       0.06M -> 0.11M     0.87x
//
// This is the strongest detail knob there now is, and it is the one to raise
// rather than `MAX_CELLS`: 168e6 takes 30x to 3.60 px and 92x to 5.42 px for
// about twice the wait, and past 240e6 nothing at depth improves because the
// hop is at its one-sample floor and `MAX_FFT` caps the padding.
const MAX_COST = 84000000;

// The share of the light on screen below which a scale is not worth analysing.
//
// The arena decides which window explains the energy where, and it gates power
// — so a scale whose share of what is visible is nil draws nothing, however many
// cells it is handed. Its cells are still computed, still uploaded to the GPU
// and still drawn, multiplied by a share of zero. Measured on a tonal take, the
// share of on-screen power against the share of the pass:
//
//   view   win 256          win 1024        win 2048
//   1x     0.2% for 25%     77.4% for 50%   22.3% for 25%
//   30x    0.0% for 58%     66.4% for 30%   33.6% for 12%
//   92x    0.0% for 51%     63.7% for 36%   36.3% for 13%
//   221x   0.0% for 58%     64.3% for 32%   35.7% for 10%
//
// So zooming into a tone spent over half of every pass on a window drawing
// nothing. Dropping it is arithmetic rather than a judgement about the picture:
// at this threshold at most 1% of the light can go with it, and in the rows
// above it is 0.0%.
//
// One per cent rather than nothing at all, because a scale that has genuinely
// lost is never at exactly zero — there is always a little noise it is bidding
// for. And a scale drops out of one *pass*, not out of the recording: the ridge
// maps and the arena are built for every scale whatever the viewport, so panning
// onto a plosive brings the short window straight back.
const SCALE_FLOOR = 0.01;

// Rendering above the display's own pixel ratio was tried, on the theory that
// supersampling would draw finer filaments. It does the opposite: TARGET_GAP
// is in device pixels, so a higher ratio spends the cell budget on sampling
// time more finely and leaves less for the padding that closes the frequency
// gap. At 256x it cost two thirds of the picture (mean luma 36.1 to 11.6,
// lit pixels 29% to 11%). The display's own ratio is the right one.
const MAX_DPR = 2;

// Export size, as a multiple of the canvas. Rendered in tiles, so the ceiling
// is the browser's rather than the GPU's — and the browser's is close: a 2D
// canvas of 253 MP still reads back on this machine and one of 288 MP does
// not, so the cap sits below that with room for a larger window. The scale is
// large enough that the cap is what decides, which makes every export as big
// as the browser will carry: 19901x10050, 3.4 s, a 116 MB PNG.
const EXPORT_SCALE = 8;
const MAX_EXPORT_PIXELS = 200e6;

// How many threads the analysis is spread over. The transforms and the
// per-cell arithmetic are the whole of the cost and they parallelise cleanly,
// so this is very nearly a straight division of the wait. Capped below the
// core count because the main thread has a picture to draw and the browser has
// a compositor to run, and because past six the M4's efficiency cores are what
// is being added — they finish a region about half as fast as a performance
// core does, which is why regions are queued rather than dealt out one each.
const POOL = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));

// Cutting a pass finer than the pool is worth doing while the regions are
// cheap: a region that lands on an efficiency core is then one of several its
// neighbours can finish without it. Past two rounds the tail is longer than the
// balance is worth.
const MAX_REGIONS = 2 * POOL;

// What a region's overlap costs, as a fraction of one of its own frames. A
// region computes D frames beyond each end so its cells meet the same
// neighbours a single call would have given them; those frames are transformed
// but never emitted, and the transforms are a little under half of what a frame
// costs — measured at 0.42 of it on a full view and 0.46 at maximum padding, so
// one figure serves for both.
const OVERLAP_COST = 0.5;

const pow2 = (v) => 1 << Math.max(0, Math.round(Math.log2(v)));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let view = null;
let current = null; // what the cloud in hand covers, and how finely, per scale
let wanted = null; // what the newest pass in flight will make it, if any
let audioFor = null; // the recording the pool has a copy of
let ridgeFor = null; // the recording the pool has ridge and share maps for
let arena = null; // the share arena and its power, for deciding which scales to run
let generation = 0; // passes are discarded rather than cancelled; this says which

// Somebody to tell while a pass is in flight, so the status line can show it.
let onBusy = null;
let busy = 0;

export function setBusyHandler(fn) {
  onBusy = fn;
}

function enter() {
  busy++;
  onBusy?.(true);
}

function leave() {
  busy--;

  if (busy === 0) {
    onBusy?.(false);
  }
}

// The pool. Workers are created on the first analysis and then kept: each one
// holds a copy of the recording and of the ridge map, so a pass costs one
// message per region and nothing else.
let workers = null;
let nextJob = 1;
const waiting = new Map();

function pool() {
  if (!workers) {
    workers = [];

    for (let i = 0; i < POOL; i++) {
      const worker = new Worker(
        new URL('./analysis-worker.js', import.meta.url),
        {
          type: 'module',
        },
      );

      worker.onmessage = ({data}) => {
        const done = waiting.get(data.job);

        if (done) {
          waiting.delete(data.job);
          done(data);
        }
      };

      workers.push(worker);
    }
  }

  return workers;
}

// Fire and forget: the recording and the ridge map, which a worker keeps.
function tell(worker, msg) {
  worker.postMessage(msg);
}

// Ask for something and wait for it.
function ask(worker, msg) {
  const job = nextJob++;

  return new Promise((resolve) => {
    waiting.set(job, resolve);
    worker.postMessage({...msg, job});
  });
}

// Deal `jobs` out to the pool, each worker taking the next one whenever it
// comes free. Resolves with the answers in the order the jobs were given.
// `threads` is how many of the pool may be busy at once, which is how the
// coherence rings are kept inside their collective budget.
async function share(jobs, threads = POOL) {
  const ws = pool().slice(0, Math.max(1, threads));
  const results = new Array(jobs.length);

  let next = 0;

  await Promise.all(
    ws.map(async (worker) => {
      for (let i = next++; i < jobs.length; i = next++) {
        results[i] = await ask(worker, jobs[i]);
      }
    }),
  );

  return results;
}

export function createRenderer(canvas) {
  view = createView(canvas);
  return !!view;
}

export function sizeOf(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  return {
    w: Math.max(1, Math.round(canvas.clientWidth * dpr)),
    h: Math.max(1, Math.round(canvas.clientHeight * dpr)),
  };
}

export function clear(canvas) {
  const {w, h} = sizeOf(canvas);
  current = wanted = null;
  audioFor = ridgeFor = null;
  arena = null;
  generation++;
  view.resize(w, h);
  view.clear();
}

export function fullSpan(rec) {
  return {t0: 0, t1: rec.samples.length, f0: F_MIN, f1: rec.sampleRate / 2};
}

// Analysis margin: how far beyond the viewport to look, when the budget is too
// small to cover the whole recording at the density the viewport wants.
const ANALYSIS_MARGIN = 0.35;

// Cells closer together than this on screen buy nothing, so the budget left
// over once time is sampled this finely goes on frequency instead.
const TARGET_GAP = 0.6;

// A second pass has to close the gaps by at least this much to be worth the
// second of blocked main thread it costs.
const WORTH_REDOING = 0.7;

// The two on-screen gaps a grid produces at a given viewport, in device pixels:
// along time, one hop; along frequency, one bin. Frequency gaps are worst at
// the bottom of a log axis and vanish at the top, so they are read off in the
// middle of the picture.
function gaps(hop, fftSize, sampleRate, vp, w, h) {
  const pxPerEfold = h / (Math.log(vp.f1) - Math.log(vp.f0));

  return {
    t: (hop * w) / (vp.t1 - vp.t0),
    f: ((sampleRate / fftSize) * pxPerEfold) / Math.sqrt(vp.f0 * vp.f1),
  };
}

// Each scale's share of the light inside a viewport, normalised to sum to one.
//
// The arena is indexed by absolute instant and absolute frequency — REACH
// samples a frame, `SHARE_ROWS` rows even in sqrt(f) — so this is a rectangle
// sum over it, and the answer is a property of the sound rather than of the
// grid any pass happened to use. Weighted by the arena's power: half of nothing
// is still nothing, and a bucket of silence must not get a vote.
//
// Returns null before the arena exists, which is the first pass of a recording.
// That one runs every scale, which is right — it is the full view.
function sharesAt(vp, sampleRate, count) {
  if (!arena || arena.share.length !== count) {
    return null;
  }

  const {share, power, frames} = arena;
  const rowScale = rowScaleFor(sampleRate);

  const clamp2 = (v, hi) => Math.min(hi, Math.max(0, v));
  const i0 = clamp2(Math.floor(vp.t0 / REACH), frames - 1);
  const i1 = Math.max(i0 + 1, clamp2(Math.ceil(vp.t1 / REACH), frames - 1));
  const r0 = clamp2(Math.floor(Math.sqrt(vp.f0) * rowScale), SHARE_ROWS - 1);
  const r1 = Math.max(
    r0 + 1,
    clamp2(Math.ceil(Math.sqrt(vp.f1) * rowScale), SHARE_ROWS - 1),
  );

  const out = new Array(count).fill(0);

  let total = 0;

  for (let i = i0; i <= i1 && i < frames; i++) {
    const base = i * SHARE_ROWS;

    for (let r = r0; r <= r1 && r < SHARE_ROWS; r++) {
      const at = base + r;
      const p = power[at];

      if (p <= 0) {
        continue;
      }

      for (let s = 0; s < count; s++) {
        const v = (p * share[s][at]) / 255;

        out[s] += v;
        total += v;
      }
    }
  }

  if (total <= 0) {
    return null;
  }

  return out.map((v) => v / total);
}

// The band of bins a scale emits at a given viewport and padding.
//
// Time has always been clipped to the viewport when the budget could not cover
// the whole recording; frequency never was, and that was the single largest
// waste in the analysis. At the 221x view of the screenshots — 2.57 to 2.64 kHz
// of a 24 kHz spectrum — 99.8% of every cell computed landed off screen, which
// is why the picture *thinned out* as it was zoomed into: `room` was starved by
// a factor of ~580, so `plan()` spent the budget coarsening the hop and capping
// the padding to afford bins nobody could see.
//
// Quantised to whole *unpadded* bins and then multiplied up by `pad`, which is
// what makes the band nest the way the hop and the padding already do: doubling
// the padding doubles every index, so a finer pass covers the same stretch of
// spectrum and adds bins inside it rather than shifting the band. The margins
// are wide enough that a small pan reuses the cloud in hand instead of
// triggering a pass.
function bandFor(vp, sampleRate, winLen, fMin, pad) {
  const nyquist = (winLen * pad) / 2;
  const unpadded = sampleRate / winLen; // one unpadded bin, Hz
  const lobe = LOBE_BINS * unpadded;

  // A scale says nothing below its own floor, so there is no sense analysing
  // below it however far down the viewport reaches.
  const reach = (vp.f1 / vp.f0) ** FREQ_MARGIN;
  const lo = Math.max(0, Math.max(vp.f0 / reach, fMin) - lobe);
  const hi = Math.min(sampleRate / 2, vp.f1 * reach + lobe);

  const k0 = Math.max(0, Math.floor(lo / unpadded));
  const k1 = Math.min(winLen / 2, Math.ceil(hi / unpadded));

  const bin0 = Math.max(1, k0 * pad);

  return {bin0, bins: Math.max(1, Math.min(nyquist, k1 * pad) - bin0)};
}

// Choosing the sampling grid.
//
// Two rules, and between them they decide everything.
//
// *Balance.* Cells land in a grid `frames` wide and `bins` tall. Spend the
// budget on time alone and the harmonics come out as rows of dashes; spend it
// on padding alone and the ridges break up along their length. What is visible
// is the *larger* of the two gaps, so the aim is to make them equal.
//
// *Nesting.* The hop is quantised to a power of two and frames are anchored to
// absolute sample positions, so every grid this can pick is a subset or a
// superset of every other one. Zooming in therefore *adds* cells at new
// positions; it never moves the ones already on screen. That, plus an exposure
// measured once and then left alone, is what makes a second pass at a closer
// view read as more detail rather than as a different picture.
//
// Zooming multiplies both gaps by the same factor, so the padding that balances
// them is the same at every zoom — only the hop moves, and only by halving.
//
// `budget` is this scale's share of the cells. Each scale plans its own grid
// against its own share, independently: the scales differ in what padding
// balances them, and a short window needs more of it to reach the same bin
// spacing, so one grid could not have served all three.
function plan(rec, vp, w, h, sc, cells, cost) {
  const {samples, sampleRate} = rec;
  const n = samples.length;
  const {winLen, fMin} = sc;

  const span = vp.t1 - vp.t0;
  const pxPerSample = w / span;

  // The finest hop worth computing at this zoom, quantised to a power of two.
  // A frame per sample is the floor: past that the transforms see the same
  // audio twice.
  const wanted = Math.max(
    1,
    2 ** Math.round(Math.log2(TARGET_GAP / pxPerSample)),
  );

  let best = null;

  for (let pad = 1; winLen * pad <= MAX_FFT; pad *= 2) {
    const fftSize = winLen * pad;
    const {bin0, bins} = bandFor(vp, sampleRate, winLen, fMin, pad);

    // What one frame of this grid costs: the cells it emits, which is memory,
    // plus its transforms, which is time. Padding buys frequency detail at no
    // cost in cells once the band is fixed, so without the second term this
    // would always take the maximum padding on offer and then wonder where the
    // afternoon went.
    const per = bins + XFM_COST * fftSize * Math.log2(winLen);
    const room = Math.min(Math.floor(cells / bins), Math.floor(cost / per));

    if (room < 64) {
      break;
    }

    let hop = wanted;
    let start = 0;
    let end = n;

    // Cover the whole recording if that fits. It does until the zoom gets
    // deep, and while it does, panning and zooming out show finished picture
    // rather than an edge — nothing is recomputed at all.
    if (Math.ceil(n / hop) > room) {
      start = Math.max(0, Math.floor(vp.t0 - span * ANALYSIS_MARGIN));
      end = Math.min(n, Math.ceil(vp.t1 + span * ANALYSIS_MARGIN));

      while (Math.ceil((end - start) / hop) > room) {
        hop *= 2;
      }
    }

    // Past REACH the ring is three frames whatever the padding, so this always
    // terminates. Coarsening the hop only removes frames, so the budgets above
    // stay satisfied. The ring holds the *computed* band — `reassign.js` reaches
    // one unpadded bin beyond each end so a cell at the edge is judged by the
    // neighbour a full-spectrum pass would have given it.
    const ring = bins + 2 * pad;

    while (
      hop < REACH &&
      ring * (2 * Math.round(REACH / hop) + 1) > MAX_RING_CELLS
    ) {
      hop *= 2;
    }

    // Anchoring to a multiple of the hop is what keeps successive grids nested.
    start -= start % hop;

    const frames = Math.max(1, Math.ceil((end - start) / hop));
    const g = gaps(hop, fftSize, sampleRate, vp, w, h);
    const worst = Math.max(g.t, g.f);

    // Ties go to the finer grid, and that is not a detail. `worst` is the
    // larger of the two gaps, so once the hop is at its one-sample floor the
    // time gap is fixed and *every* padding above the crossover scores exactly
    // the same — at which point a strict `<` keeps the first, coarsest one and
    // throws away padding the budget had already agreed to pay for. At the 221x
    // view that was the difference between `fftSize` 131072 and 262144: half
    // the frequency sampling, for nothing.
    const better =
      !best ||
      worst < best.worst - 1e-9 ||
      (worst < best.worst + 1e-9 && g.f < best.gap.f);

    if (better) {
      best = {
        pad,
        fftSize,
        bin0,
        bins,
        ring,
        hop,
        frames,
        start,
        worst,
        gap: g,
      };
    }
  }

  return best;
}

// How many regions a pass is cut into.
//
// The overlap is a constant per region rather than a share of it, so splitting
// further always shortens a *round* — but a round is only free while there are
// idle threads to take it, and the seventeenth region of a pool of eight waits
// for a second round that costs as much again. So: the time is the cost of one
// region times the number of rounds, and this picks the count that minimises
// it. Nothing subtler is warranted; the answer is the pool size almost
// everywhere, and it only departs from it where the overlap is large enough to
// matter — the deepest zooms, where the hop is 1 and D is the whole of REACH.
function regionsFor(frames, hop) {
  const D = Math.max(1, Math.round(REACH / hop));
  const overlap = 2 * D * OVERLAP_COST;

  let best = 1;
  let cost = Infinity;

  for (let r = 1; r <= MAX_REGIONS; r++) {
    const round = Math.ceil(r / POOL) * (frames / r + overlap);

    if (round < cost) {
      cost = round;
      best = r;
    }
  }

  return best;
}

// The window lengths this recording is analysed at, longest last, with the
// lowest frequency each is entitled to speak about.
//
// A take too short to hold a long window simply gets fewer scales: the clamp
// collapses the long one onto the base, and the duplicate is dropped. That is
// the right degradation — a 60 ms take has nothing an 85 ms window could
// measure — and it means the scale count is never something the rest of the
// file has to be told.
function scalesFor(rec) {
  const {samples, sampleRate} = rec;

  const cap = Math.min(WIN_MAX, Math.max(WIN_MIN, pow2(samples.length / 4)));
  const out = [];

  SCALE_STEPS.forEach((step, i) => {
    const winLen = clamp(
      pow2((sampleRate * WIN_MS * step) / 1000),
      WIN_MIN,
      cap,
    );

    if (out.some((o) => o.winLen === winLen)) {
      return;
    }

    out.push({
      index: out.length,
      winLen,
      weight: SCALE_WEIGHTS[i],
      fMin: Math.max(F_MIN, (MIN_CYCLES * sampleRate) / winLen),
      fMax: sampleRate / 2,
    });
  });

  return out;
}

// Analyse what the viewport asks for, on the pool, and swap the result in when
// it is finished. `calibrate` sets the exposure from the whole recording, and
// is done once per recording: everything the picture does with colour is then a
// property of the sound rather than of where you happen to be looking.
//
// Every scale is planned, cut into regions and run in the same pass, and the
// regions of all of them are dealt out to the pool as one queue — so a scale
// that finishes early does not leave threads idle. They land in one GL buffer,
// laid end to end, and `glview.js` draws each with its own hop and bin spacing.
//
// Resolves to null when the pass was not worth running, or when a later one
// overtook it — passes are discarded rather than cancelled, because a worker in
// the middle of a region cannot be interrupted without a SharedArrayBuffer and
// the page is not cross-origin isolated. Nothing outside this function ever
// sees a half-finished cloud: a pass is staged whole in the workers and lands
// in one piece.
export async function analyze(canvas, rec, viewport, calibrate) {
  const {w, h} = sizeOf(canvas);
  view.resize(w, h);

  const {samples, sampleRate} = rec;

  const all = scalesFor(rec);

  // A scale whose band is entirely above the viewport has nothing to draw
  // there, so it is left out of the pass and its cells go to the scales that
  // do — which is exactly the low end, where the log axis spreads the bins
  // widest and the extra frames are worth most. The whole band is always
  // covered by the longest scale, so this can never empty the list.
  const inBand = all.filter((sc) => viewport.f1 > sc.fMin);

  // And a scale the arena has already decided draws nothing here is not worth a
  // pass either — see `SCALE_FLOOR`. The largest share always survives, so this
  // can no more empty the list than the band test above can.
  const shares = sharesAt(viewport, sampleRate, all.length);
  const best = shares ? Math.max(...inBand.map((sc) => shares[sc.index])) : 0;

  const live = shares
    ? inBand.filter((sc) => shares[sc.index] >= Math.min(SCALE_FLOOR, best))
    : inBand;

  const use = live.length ? live : [all[all.length - 1]];
  const weight = use.reduce((t, sc) => t + sc.weight, 0);

  const active = [];

  for (const sc of use) {
    const grid = plan(
      rec,
      viewport,
      w,
      h,
      sc,
      (MAX_CELLS * sc.weight) / weight,
      (MAX_COST * sc.weight) / weight,
    );

    if (grid) {
      active.push({...sc, grid});
    }
  }

  if (!active.length) {
    return null;
  }

  // Is this pass worth a pass? Only if some scale's cloud in hand does not
  // already reach across the viewport, or if its new grid would be markedly
  // finer *at this viewport* than the one that cloud was built on. Without this
  // a slow scroll fires a full analysis between every notch, for a gain nobody
  // can see.
  //
  // Asked of whatever a pass in flight is about to produce, if there is one,
  // and of the cloud in hand otherwise. Asking only about the cloud in hand
  // would start a second identical pass behind the first, since the first has
  // not landed yet.
  //
  // The two gaps are compared separately, and either one closing is enough. The
  // larger of the two on its own is not a fair test: deep into a zoom the
  // frequency gap is stuck at whatever the FFT cap allows and swamps the
  // comparison, hiding the fourfold gain in time that is the whole reason the
  // ridges join up down there. And one scale wanting a pass is enough to run
  // one, since the pass has to redraw all of them together regardless.
  const against = wanted || current;

  if (!calibrate && against) {
    const settled = active.every((a) => {
      const was = against[a.index];

      // Reaching outside what that cloud covers — in time, or now in
      // frequency too — is the one thing that forces a pass regardless of how
      // fine the grid is. Panning up out of the analysed band would otherwise
      // slide off the edge of the picture into black.
      if (!was || viewport.t0 < was.start || viewport.t1 > was.end) {
        return false;
      }

      if (viewport.f0 < was.fLo || viewport.f1 > was.fHi) {
        return false;
      }

      const now = gaps(was.hop, was.fftSize, sampleRate, viewport, w, h);

      return (
        a.grid.gap.t > now.t * WORTH_REDOING &&
        a.grid.gap.f > now.f * WORTH_REDOING
      );
    });

    if (settled) {
      return null;
    }
  }

  const gen = ++generation;

  wanted = {};

  for (const a of active) {
    wanted[a.index] = {
      start: a.grid.start,
      end: a.grid.start + a.grid.frames * a.grid.hop,
      hop: a.grid.hop,
      fftSize: a.grid.fftSize,
      fLo: (a.grid.bin0 * sampleRate) / a.grid.fftSize,
      fHi: ((a.grid.bin0 + a.grid.bins) * sampleRate) / a.grid.fftSize,
    };
  }

  enter();

  try {
    // The recording, once. Every worker gets its own copy, which is a few
    // megabytes each and saves passing it with every region.
    if (audioFor !== rec) {
      for (const worker of pool()) {
        tell(worker, {type: 'audio', samples, sampleRate});
      }

      audioFor = rec;
      ridgeFor = null;
    }

    // The ridge maps and the share arena, once per recording. Each covers the
    // whole recording on a grid of its own, so a deep zoom reads the same
    // answers a full view did — were they rebuilt for a viewport, a 100x zoom
    // would be asking whether ridges persist across a span a few hundred
    // samples wide, and whether a window suits it, and nothing does at that
    // range.
    //
    // Built for *every* scale, including any the current viewport leaves out:
    // a later pass at another zoom will want the one that was skipped, and
    // building it then would be a stall in the middle of a gesture.
    //
    // One scale per worker, so the walks run in parallel; then one worker
    // divides the energy between them, and the answers are copied round. A
    // worker is not sent back the map it built itself.
    if (ridgeFor !== rec) {
      const ws = pool();
      const owner = all.map((sc, i) => i % ws.length);

      const built = await Promise.all(
        all.map((sc, i) =>
          ask(ws[owner[i]], {
            type: 'ridge',
            scale: i,
            winLen: sc.winLen,
            fMin: sc.fMin,
            fMax: sc.fMax,
          }),
        ),
      );

      if (gen !== generation) {
        return null;
      }

      const {share: blended, power} = await ask(ws[0], {
        type: 'blend',
        frames: built[0].frames,
        parts: built.map((b) => ({sumP: b.sumP, sumPG: b.sumPG})),
        priors: all.map((sc) => sc.weight),
      });

      if (gen !== generation) {
        return null;
      }

      const maps = built.map((b) => ({
        support: b.support,
        frames: b.frames,
        bins: b.bins,
      }));

      ws.forEach((worker, i) => {
        tell(worker, {
          type: 'maps',
          maps: maps.map((map, k) => (owner[k] === i ? null : map)),
          share: blended,
        });
      });

      // Kept on this side too, so a later pass can ask which scales are worth
      // running before it plans anything.
      arena = {share: blended, power, frames: built[0].frames};
      ridgeFor = rec;
    }

    // One queue of regions across every scale, so the pool never idles waiting
    // on the slowest scale, and one layout saying where each scale's stretch of
    // the buffer begins. A scale reserves the room its frames would fill at
    // their widest — one cell per bin — for the same reason a region does.
    const jobs = [];
    const layout = [];

    let offset = 0;
    let ring = 0;

    for (const a of active) {
      const {bin0, bins, hop, frames, start, fftSize} = a.grid;
      const count = regionsFor(frames, hop);
      const first = jobs.length;

      ring = Math.max(
        ring,
        a.grid.ring * (2 * Math.max(1, Math.round(REACH / hop)) + 1),
      );

      for (let i = 0; i < count; i++) {
        const frame0 = Math.round((i * frames) / count);
        const frame1 = Math.round(((i + 1) * frames) / count);

        if (frame1 > frame0) {
          jobs.push({
            type: 'cells',
            scale: a.index,
            winLen: a.winLen,
            fftSize,
            bin0,
            bins,
            hop,
            frames,
            frame0,
            frame1,
            tStart: start,
            fMin: a.fMin,
            fMax: a.fMax,
          });
        }
      }

      layout.push({a, base: offset, first, count: jobs.length - first});
      offset += frames * bins;
    }

    const parts = await share(jobs, Math.floor(MAX_POOL_RING_CELLS / ring));

    if (gen !== generation) {
      return null;
    }

    // Every region owns the stretch of the buffer its frames would fill at
    // their widest, so it knows where its cells go without waiting to hear how
    // many its neighbours produced. The gaps that leaves — bins that held
    // nothing, or fell outside the audible band — are simply never drawn: each
    // region is a contiguous run of its own, and `glview.js` draws the visible
    // frames as one range per region of each scale rather than one range
    // overall.
    const scales = [];

    let total = 0;

    view.begin(offset);

    for (const {a, base, first, count} of layout) {
      const {bins, hop, frames, start, fftSize} = a.grid;
      const starts = new Uint32Array(frames);
      const regions = [];

      for (let k = 0; k < count; k++) {
        const part = parts[first + k];
        const at = base + part.frame0 * bins;

        view.pushAt(at, part.cells, part.count);

        for (let f = part.frame0; f < part.frame1; f++) {
          starts[f] = at + part.starts[f - part.frame0];
        }

        regions.push({
          f0: part.frame0,
          f1: part.frame1,
          end: at + part.count,
        });
        total += part.count;
      }

      scales.push({
        hop,
        binHz: sampleRate / fftSize,
        winLen: a.winLen,
        frames,
        starts,
        regions,
        tStart: start,
      });
    }

    view.end({sampleRate, scales});

    current = wanted;

    if (calibrate) {
      view.calibrate(fullSpan(rec));
    }

    return {
      scales: active.map((a) => ({winLen: a.winLen, ...a.grid})),
      total,
      regions: jobs.length,
    };
  } finally {
    if (gen === generation) {
      wanted = null;
    }

    leave();
  }
}

export function draw(canvas, viewport) {
  const {w, h} = sizeOf(canvas);
  view.resize(w, h);
  view.render(viewport);
}

// What the accumulation buffer holds at one point of the current viewport:
// amplitude above the recording's own background, mean coherence, mean sweep
// drive. u, v are fractions of the canvas (v downwards from the top); f is the
// frequency already known to correspond to v, so the background lookup does
// not have to be redone here.
export function sampleCell(u, v, f) {
  return view.sampleCell(u, v, f);
}

// The part of `v` covered by the given fractions of its width and height, the
// vertical ones measured downwards from the top.
function crop(v, u0, u1, y0, y1) {
  const l0 = Math.log(v.f0);
  const lSpan = Math.log(v.f1) - l0;

  return {
    t0: v.t0 + u0 * (v.t1 - v.t0),
    t1: v.t0 + u1 * (v.t1 - v.t0),
    f0: Math.exp(l0 + (1 - y1) * lSpan),
    f1: Math.exp(l0 + (1 - y0) * lSpan),
  };
}

// The same picture, several times larger than the screen, as a PNG. Drawn in
// tiles: the accumulation buffer costs 16 bytes a pixel, so one the size of the
// whole export would run to gigabytes, and a tile only has to touch the cells
// whose time falls inside it.
export async function exportImage(canvas, viewport, onProgress) {
  const {w, h} = sizeOf(canvas);

  const fit = Math.min(
    1,
    Math.sqrt(MAX_EXPORT_PIXELS / (w * h * EXPORT_SCALE * EXPORT_SCALE)),
  );
  const W = Math.round(w * EXPORT_SCALE * fit);
  const H = Math.round(h * EXPORT_SCALE * fit);

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;

  const ctx = out.getContext('2d');
  const step = view.maxTile;
  const pixels = new Uint8ClampedArray(step * step * 4);
  const tiles = Math.ceil(W / step) * Math.ceil(H / step);

  let done = 0;

  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const tw = Math.min(step, W - x);
      const th = Math.min(step, H - y);
      const px = pixels.subarray(0, tw * th * 4);

      view.tile(
        crop(viewport, x / W, (x + tw) / W, y / H, (y + th) / H),
        tw,
        th,
        H,
        px,
      );
      ctx.putImageData(new ImageData(px, tw, th), x, y);

      done++;
      onProgress?.(done, tiles);

      // Let the page repaint between tiles; this takes a few seconds.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // The screen wants its own buffer back.
  view.resize(w, h);

  return {
    blob: await new Promise((resolve) => out.toBlob(resolve, 'image/png')),
    W,
    H,
  };
}
