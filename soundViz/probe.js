import {SIGNALS} from './signals/signals.js';

// Measuring the picture against the truth.
//
// Load one of the test signals (`signals/<name>.wav`) and its right answer is
// known exactly — every partial's frequency at every instant, every click's
// instant — so the picture can be scored against it rather than against the
// last build. `measure()` reads the accumulation buffer, which holds the power
// every pixel of the current viewport received, and asks how much of that
// power landed where the sound actually is, and how tightly.
//
// The page installs this as `window.soundViz`, so a browser driver can load a
// signal, step through exact viewports, and read numbers back:
//
//   await soundViz.load('signals/close.wav');
//   await soundViz.zoomTo({t: 1, f: 1025, zoom: 30});
//   await soundViz.measure();
//
// None of it runs unless something calls it.

// How near the truth counts as on it, as a fraction of the frequency (0.5% is
// about nine cents) or in milliseconds for a click. Never finer than a pixel
// and a half of the current view, since the picture cannot place anything more
// finely than that.
const TOL_REL = 0.005;
const TOL_MS = 1;

// Distances from the truth are also collected into a log-spaced histogram, in
// cents for a partial and milliseconds for a click, so their power-weighted
// percentiles can be read off with no tolerance at all. `onTarget` says how
// much power is stray; `p50` and `p90` say how tightly the rest is drawn.
const HIST_LO = 1e-4;
const HIST_HI = 1e4;
const HIST_BINS = 400;
const HIST_STEP = Math.log(HIST_HI / HIST_LO) / HIST_BINS;

function quantile(hist, total, q) {
  let acc = 0;

  for (let i = 0; i < HIST_BINS; i++) {
    acc += hist[i];

    if (acc >= q * total) {
      return HIST_LO * Math.exp((i + 1) * HIST_STEP);
    }
  }

  return Infinity;
}

export function signalFor(name) {
  const m = /(?:^|\/)([a-z]+)\.wav$/i.exec(name || '');
  return m && SIGNALS[m[1]] ? {name: m[1], ...SIGNALS[m[1]]} : null;
}

// Brightness of what is on screen: the share of pixels lit at all, their mean
// luma, and their mean chroma.
function imageStats({pixels}) {
  let lit = 0;
  let luma = 0;
  let chroma = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (y > 8) {
      lit++;
      luma += y;
      chroma += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    }
  }

  const px = pixels.length / 4;

  return {
    lit: lit / px,
    luma: lit ? luma / lit : 0,
    chroma: lit ? chroma / lit : 0,
  };
}

// The accumulation buffer scored against the truth.
function powerStats({w, h, data}, vp, sampleRate, signal) {
  const l0 = Math.log(vp.f0);
  const lSpan = Math.log(vp.f1) - l0;
  const tSpan = vp.t1 - vp.t0;

  const rowRel = Math.expm1(lSpan / h);
  const tolRel = Math.max(TOL_REL, 1.5 * rowRel);
  const tolMs = Math.max(TOL_MS, (1.5 * 1000 * tSpan) / w / sampleRate);

  let total = 0;
  let coherent = 0;
  let on = 0;
  let scored = 0;

  const hist = new Float64Array(HIST_BINS);

  // Frequencies per row, and the truth per column — computed once, since a
  // signal's partials depend only on the instant.
  const fRow = new Float64Array(h);

  for (let r = 0; r < h; r++) {
    fRow[r] = Math.exp(l0 + ((r + 0.5) / h) * lSpan);
  }

  for (let c = 0; c < w; c++) {
    const tSec = (vp.t0 + ((c + 0.5) / w) * tSpan) / sampleRate;
    const partials = signal ? signal.partials(tSec) : [];
    const clickMs = signal?.clicks
      ? Math.min(...signal.clicks.map((k) => Math.abs(k - tSec) * 1000))
      : Infinity;

    for (let r = 0; r < h; r++) {
      const at = (r * w + c) * 4;
      const p = data[at];

      if (!(p > 0)) {
        continue;
      }

      total += p;
      coherent += data[at + 3];

      if (!signal) {
        continue;
      }

      // Distance to the truth: the nearest partial in cents, or the nearest
      // click in milliseconds, whichever this signal has.
      let cents = Infinity;

      for (const f of partials) {
        cents = Math.min(cents, Math.abs(1200 * Math.log2(fRow[r] / f)));
      }

      const d = signal.clicks ? clickMs : cents;

      if (d === Infinity) {
        continue;
      }

      const onIt = signal.clicks
        ? clickMs <= tolMs
        : cents <= 1200 * Math.log2(1 + tolRel);

      if (onIt) {
        on += p;
      }

      const bin = Math.floor(
        Math.log(Math.max(d, HIST_LO) / HIST_LO) / HIST_STEP,
      );

      hist[Math.min(HIST_BINS - 1, Math.max(0, bin))] += p;
      scored += p;
    }
  }

  return {
    power: total,
    coherence: total ? coherent / total : 0,
    onTarget: signal && total ? on / total : null,
    p50: scored ? quantile(hist, scored, 0.5) : null,
    p90: scored ? quantile(hist, scored, 0.9) : null,
    unit: signal?.clicks ? 'ms' : 'cents',

    // One pixel of the view in the same unit: the finest `p50` could show.
    pixel: signal?.clicks
      ? (1000 * tSpan) / w / sampleRate
      : 1200 * Math.log2(1 + rowRel),
    tolRel,
    tolMs,
  };
}

export function measure({rec, viewport, readAccum, snapshot, status}) {
  if (!rec) {
    return null;
  }

  const signal = signalFor(rec.name);
  const accum = readAccum();
  const shot = snapshot();

  const round = (v, d = 4) => (v === null ? null : +v.toFixed(d));
  const p = accum ? powerStats(accum, viewport, rec.sampleRate, signal) : null;
  const img = shot ? imageStats(shot) : null;

  return {
    signal: signal?.name ?? null,
    status: status(),
    viewport: {
      t0: viewport.t0 / rec.sampleRate,
      t1: viewport.t1 / rec.sampleRate,
      f0: viewport.f0,
      f1: viewport.f1,
    },
    // Share of the drawn power within tolerance of the truth (higher is
    // better), and the power-weighted median and 90th percentile distance from
    // it, in `unit` (lower is better, down to `pixel`).
    onTarget: p && round(p.onTarget),
    p50: p && round(p.p50, 4),
    p90: p && round(p.p90, 4),
    unit: p && p.unit,
    pixel: p && round(p.pixel, 4),
    coherence: p && round(p.coherence),
    lit: img && round(img.lit),
    luma: img && round(img.luma, 1),
    chroma: img && round(img.chroma),
    tolRel: p && round(p.tolRel, 5),
    tolMs: p && round(p.tolMs, 3),
  };
}
