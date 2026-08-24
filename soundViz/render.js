import {REACH} from './ridge.js';
import {createView} from './glview.js';

export const F_MIN = 60;

// Window duration is fixed in milliseconds and has nothing to do with the
// viewport. It sets the character of the analysis — how finely harmonics are
// separated, how sharply a transient reads.
const WIN_MS = 25;
const WIN_MIN = 256;
const WIN_MAX = 2048;

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
// 48M is the knee: the full view is saturated (strokes meet), deep zoom has
// four times the cells 16M gave it, and the draw still runs at 120 fps. Past
// it the wait doubles and the picture does not move.
const MAX_CELLS = 48000000;

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

const pow2 = v => 1 << Math.max(0, Math.round(Math.log2(v)));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let view = null;
let current = null; // what the cloud in hand covers, and how finely
let wanted = null; // what the newest pass in flight will make it, if any
let audioFor = null; // the recording the pool has a copy of
let ridgeFor = null; // the recording the pool has a ridge map for
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
      const worker = new Worker(new URL('./analysis-worker.js', import.meta.url), {
        type: 'module',
      });

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

  return new Promise(resolve => {
    waiting.set(job, resolve);
    worker.postMessage({...msg, job});
  });
}

// Deal `jobs` out to the pool, each worker taking the next one whenever it
// comes free. Resolves with the answers in the order the jobs were given.
async function share(jobs) {
  const ws = pool();
  const results = new Array(jobs.length);

  let next = 0;

  await Promise.all(
    ws.map(async worker => {
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
function plan(rec, vp, w, h, winLen) {
  const {samples, sampleRate} = rec;
  const n = samples.length;

  const span = vp.t1 - vp.t0;
  const pxPerSample = w / span;

  // The finest hop worth computing at this zoom, quantised to a power of two.
  // A frame per sample is the floor: past that the transforms see the same
  // audio twice.
  const wanted = Math.max(1, 2 ** Math.round(Math.log2(TARGET_GAP / pxPerSample)));

  let best = null;

  for (let pad = 1; winLen * pad <= MAX_FFT; pad *= 2) {
    const fftSize = winLen * pad;
    const bins = fftSize / 2 - 1;
    const budget = Math.floor(MAX_CELLS / bins);

    if (budget < 64) {
      break;
    }

    let hop = wanted;
    let start = 0;
    let end = n;

    // Cover the whole recording if that fits. It does until the zoom gets
    // deep, and while it does, panning and zooming out show finished picture
    // rather than an edge — nothing is recomputed at all.
    if (Math.ceil(n / hop) > budget) {
      start = Math.max(0, Math.floor(vp.t0 - span * ANALYSIS_MARGIN));
      end = Math.min(n, Math.ceil(vp.t1 + span * ANALYSIS_MARGIN));

      while (Math.ceil((end - start) / hop) > budget) {
        hop *= 2;
      }
    }

    // Past REACH the ring is three frames whatever the padding, so this always
    // terminates. Coarsening the hop only removes frames, so the cell budget
    // above stays satisfied.
    while (hop < REACH && bins * (2 * Math.round(REACH / hop) + 1) > MAX_RING_CELLS) {
      hop *= 2;
    }

    // Anchoring to a multiple of the hop is what keeps successive grids nested.
    start -= start % hop;

    const frames = Math.max(1, Math.ceil((end - start) / hop));
    const g = gaps(hop, fftSize, sampleRate, vp, w, h);
    const worst = Math.max(g.t, g.f);

    if (!best || worst < best.worst) {
      best = {pad, fftSize, bins, hop, frames, start, worst, gap: g};
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
function regionsFor(frames, hop, bins) {
  const D = Math.max(1, Math.round(REACH / hop));
  const overlap = 2 * D * OVERLAP_COST;

  // Each region in flight holds a coherence ring of this many cells.
  const ring = bins * (2 * D + 1);
  const most = Math.max(1, Math.min(MAX_REGIONS, Math.floor(MAX_POOL_RING_CELLS / ring)));

  let best = 1;
  let cost = Infinity;

  for (let r = 1; r <= most; r++) {
    const round = Math.ceil(r / POOL) * (frames / r + overlap);

    if (round < cost) {
      cost = round;
      best = r;
    }
  }

  return best;
}

// Analyse what the viewport asks for, on the pool, and swap the result in when
// it is finished. `calibrate` sets the exposure from the whole recording, and
// is done once per recording: everything the picture does with colour is then a
// property of the sound rather than of where you happen to be looking.
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

  const winLen = clamp(
    pow2((sampleRate * WIN_MS) / 1000),
    WIN_MIN,
    Math.min(WIN_MAX, Math.max(WIN_MIN, pow2(samples.length / 4))),
  );

  const chosen = plan(rec, viewport, w, h, winLen);
  const {pad, fftSize, bins, hop, frames, start} = chosen;

  // Is this pass worth a pass? Only if the cloud in hand does not already reach
  // across the viewport, or if the new grid would be markedly finer *at this
  // viewport* than the one that cloud was built on. Without this a slow scroll
  // fires a full analysis between every notch, for a gain nobody can see.
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
  // ridges join up down there.
  const against = wanted || current;

  if (!calibrate && against && viewport.t0 >= against.start && viewport.t1 <= against.end) {
    const now = gaps(against.hop, against.fftSize, sampleRate, viewport, w, h);

    if (chosen.gap.t > now.t * WORTH_REDOING && chosen.gap.f > now.f * WORTH_REDOING) {
      return null;
    }
  }

  const grid = {start, end: start + frames * hop, hop, fftSize};
  const gen = ++generation;

  wanted = grid;
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

    // The ridge map covers the whole recording on a grid of its own, so it is
    // built once and then read by every pass. That is what keeps it out of the
    // zoom: were it rebuilt for a viewport, a deep zoom would be asking whether
    // ridges persist across a span a few hundred samples wide, and nothing
    // does. One worker walks the chains and the rest are handed the answer.
    if (ridgeFor !== rec) {
      const ws = pool();
      const map = await ask(ws[0], {type: 'ridge', winLen});

      if (gen !== generation) {
        return null;
      }

      for (let i = 1; i < ws.length; i++) {
        tell(ws[i], {
          type: 'map',
          support: map.support,
          frames: map.frames,
          bins: map.bins,
        });
      }

      ridgeFor = rec;
    }

    const count = regionsFor(frames, hop, bins);
    const jobs = [];

    for (let i = 0; i < count; i++) {
      const frame0 = Math.round((i * frames) / count);
      const frame1 = Math.round(((i + 1) * frames) / count);

      if (frame1 > frame0) {
        jobs.push({
          type: 'cells',
          winLen,
          fftSize,
          bins,
          hop,
          frames,
          frame0,
          frame1,
          tStart: start,
          fMin: F_MIN,
          fMax: sampleRate / 2,
        });
      }
    }

    const parts = await share(jobs);

    if (gen !== generation) {
      return null;
    }

    // Every region owns the stretch of the buffer its frames would fill at
    // their widest, so it knows where its cells go without waiting to hear how
    // many its neighbours produced. The gaps that leaves — bins that held
    // nothing, or fell outside the audible band — are simply never drawn: each
    // region is a contiguous run of its own, and `glview.js` draws the visible
    // frames as one range per region rather than one range overall.
    const starts = new Uint32Array(frames);
    const regions = [];

    let total = 0;

    view.begin(frames * bins);

    for (const part of parts) {
      const base = part.frame0 * bins;

      view.pushAt(base, part.cells, part.count);

      for (let f = part.frame0; f < part.frame1; f++) {
        starts[f] = base + part.starts[f - part.frame0];
      }

      regions.push({
        f0: part.frame0,
        f1: part.frame1,
        end: base + part.count,
      });
      total += part.count;
    }

    view.end({
      hop,
      binHz: sampleRate / fftSize,
      sampleRate,
      winLen,
      frames,
      starts,
      regions,
      tStart: start,
    });

    current = grid;

    if (calibrate) {
      view.calibrate(fullSpan(rec));
    }

    return {
      winLen,
      fftSize,
      pad,
      frames,
      hop,
      start,
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

  const fit = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (w * h * EXPORT_SCALE * EXPORT_SCALE)));
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

      view.tile(crop(viewport, x / W, (x + tw) / W, y / H, (y + th) / H), tw, th, H, px);
      ctx.putImageData(new ImageData(px, tw, th), x, y);

      done++;
      onProgress?.(done, tiles);

      // Let the page repaint between tiles; this takes a few seconds.
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // The screen wants its own buffer back.
  view.resize(w, h);

  return {
    blob: await new Promise(resolve => out.toBlob(resolve, 'image/png')),
    W,
    H,
  };
}
