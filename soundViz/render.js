import {analyzeCells} from './reassign.js';
import {createView} from './glview.js';

export const F_MIN = 60;

// Window duration is fixed in milliseconds and has nothing to do with the
// viewport. It sets the character of the analysis — how finely harmonics are
// separated, how sharply a transient reads.
const WIN_MS = 25;
const WIN_MIN = 256;
const WIN_MAX = 2048;

const MAX_FFT = 32768;

// Cells cost 20 bytes each on the GPU and roughly 100 ns each to compute, so
// this is a memory budget and a "how long you wait after letting go of the
// button" budget at the same time. At this size the whole of a short recording
// fits in one pass, which is what lets most panning and zooming happen with
// nothing recomputed at all.
const MAX_CELLS = 16000000;

const MAX_DPR = 2;

// Export size, as a multiple of the canvas. Rendered in tiles, so the ceiling
// is the browser's rather than the GPU's.
const EXPORT_SCALE = 4;
const MAX_EXPORT_PIXELS = 120e6;

const pow2 = v => 1 << Math.max(0, Math.round(Math.log2(v)));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let view = null;
let current = null; // what the cloud in hand covers, and how finely

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
  current = null;
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

// Analyse what the viewport asks for. `calibrate` sets the exposure from the
// whole recording, and is done once per recording: everything the picture does
// with colour is then a property of the sound rather than of where you happen
// to be looking.
export function analyze(canvas, rec, viewport, calibrate) {
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

  // Is this pass worth a second of blocked main thread? Only if the cloud in
  // hand does not already reach across the viewport, or if the new grid would
  // be markedly finer *at this viewport* than the one that cloud was built on.
  // Without this a slow scroll fires a full analysis between every notch, for a
  // gain nobody can see.
  //
  // The two gaps are compared separately, and either one closing is enough. The
  // larger of the two on its own is not a fair test: deep into a zoom the
  // frequency gap is stuck at whatever the FFT cap allows and swamps the
  // comparison, hiding the fourfold gain in time that is the whole reason the
  // ridges join up down there.
  if (!calibrate && current && viewport.t0 >= current.start && viewport.t1 <= current.end) {
    const now = gaps(current.hop, current.fftSize, sampleRate, viewport, w, h);

    if (chosen.gap.t > now.t * WORTH_REDOING && chosen.gap.f > now.f * WORTH_REDOING) {
      return null;
    }
  }

  current = {start, end: start + frames * hop, hop, fftSize};

  view.begin(frames * bins);

  const {total, starts} = analyzeCells({
    samples,
    sampleRate,
    winLen,
    fftSize,
    hop,
    frames,
    tStart: start,
    fMin: F_MIN,
    fMax: sampleRate / 2,
    onCells: (cells, k) => view.push(cells, k),
  });

  view.end({hop, binHz: sampleRate / fftSize, sampleRate, winLen, frames, starts, tStart: start});

  if (calibrate) {
    view.calibrate(fullSpan(rec));
  }

  return {winLen, fftSize, pad, frames, hop, start, total};
}

export function draw(canvas, viewport) {
  const {w, h} = sizeOf(canvas);
  view.resize(w, h);
  view.render(viewport);
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

  return {blob: await new Promise(resolve => out.toBlob(resolve, 'image/png')), W, H};
}
