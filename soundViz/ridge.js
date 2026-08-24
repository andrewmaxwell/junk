import {FFT} from './fft.js';

// The ridge map: how much of a ridge stands behind each part of the picture.
//
// `reassign.js` asks every cell whether two neighbours corroborate it. That is
// a *local* test, and a local test has a ceiling it cannot pass: the
// reassignment field of white noise is self-correlated over roughly one
// analysis window, so noise's most coherent tail agrees with its neighbours
// just as convincingly as a real partial does, and at deep zoom it chains into
// faint filaments that look like signal. Only following a ridge for a while
// tells the two apart — noise runs out after about a window, structure keeps
// going.
//
// So this file walks the chains. On a fixed coarse grid it links each cell to
// its neighbour in time and its neighbour in frequency wherever the step lies
// along the direction both ends measured, and records the length of the whole
// maximal chain through every cell. `support` is that length, softened to a
// 0..1 gate, and `reassign.js` folds it into the coherence it emits.
//
// Two things make this affordable and, more importantly, stable:
//
// **One grid for the whole recording, computed once.** The map is not a
// function of the viewport, so it cannot restate the picture when you zoom —
// the same reason `glview.js` measures the background once. It also means the
// chains never run into the edge of an analysed span: at 100x the analysis
// covers a few hundred samples, and a ridge test that could only see that far
// would fail everything.
//
// **No zero padding, and frames REACH samples apart.** Padding puts bins where
// they already were, so the map's bins are exactly the unpadded bins any
// analysis pass shares, and a cell at padded bin b looks up b/pad whatever pad
// it was analysed with. Cost is 2 transforms of `winLen` per REACH samples —
// about 45 ms per second of audio, once per recording, against the ~1.3 s the
// cloud itself takes.

// How far apart corroboration is asked for, in samples. `reassign.js` probes
// across frames at the same distance: both are asking the same question at the
// same scale, and both are pinned to samples rather than to frames so that
// neither depends on the hop the viewport happened to ask for.
export const REACH = 64;

// A step this far off the direction its two ends measured is not a link, in the
// same normalised units the coherence residual uses. Deliberately loose: one
// link is weak evidence either way, and it is the *chain* that convicts.
const LINK_CUT = 0.4;

// The resolution cell of the analysis: one window long, and as wide as the main
// lobe of a Hann window. Chain lengths are measured in these, so that a run
// along time and a run along frequency can be compared at all — and so that the
// thresholds below mean something ("persists for a window and a half") rather
// than counting frames of a grid.
const LOBE_BINS = 4;

// How long a chain has to be before its cells are believed. Measured on
// synthetic signals: white noise's chains die at about one resolution cell
// (that is the correlation length of its own reassignment field), while speech,
// tones, chirps and clicks all run to several.
const SUPPORT_LO = 1.5;
const SUPPORT_HI = 6;

// The chain is asked to prove that structure continues, and the ends of the
// recording are where it cannot: a partial still sounding when the take stopped
// did not stop. A chain reaching the first or last frame therefore counts as
// unbroken rather than as ended — the same rule `reassign.js` uses when a
// neighbour is missing, where a missing side abstains rather than accuses.
// Frequency needs no such rule: DC and Nyquist really are the ends.
const OPEN = 255;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Perpendicular residual of a step (ddt, ddf) against the direction a cell
// measured, all in normalised units — the same quantity `reassign.js` scores
// its coherence from.
function offAxis(row, i, ddt, ddf) {
  const dx = row.dx[i];
  const dy = row.dy[i];
  const len = row.dl[i];

  return len > 1e-12 ? Math.abs(ddt * dy - ddf * dx) / len : Math.sqrt(ddt * ddt + ddf * ddf);
}

export function buildRidge({samples, sampleRate, winLen}) {
  const fftSize = winLen; // unpadded: the map is indexed by the bins every pass shares
  const bins = fftSize / 2;
  const frames = Math.floor(samples.length / REACH) + 1;

  const fft = new FFT(fftSize);
  const centre = (winLen - 1) / 2;
  const align = -(winLen >> 1);

  const w = new Float32Array(winLen);
  const tw = new Float32Array(winLen);
  const dw = new Float32Array(winLen);

  for (let n = 0; n < winLen; n++) {
    const phase = (2 * Math.PI * n) / winLen;
    w[n] = 0.5 - 0.5 * Math.cos(phase);
    tw[n] = (n - centre) * w[n];
    dw[n] = (Math.PI / winLen) * Math.sin(phase);
  }

  const binHz = sampleRate / fftSize;
  const hzPerRad = sampleRate / (2 * Math.PI);

  const tau = winLen / 4; // time scale, samples
  const phi = sampleRate / winLen; // frequency scale: one bin of this map, Hz

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const dRe = new Float32Array(fftSize);
  const dIm = new Float32Array(fftSize);

  const makeRow = () => ({
    t: new Float32Array(bins),
    f: new Float32Array(bins),
    dx: new Float32Array(bins),
    dy: new Float32Array(bins),
    dl: new Float32Array(bins),
    ok: new Uint8Array(bins),
  });

  let cur = makeRow();
  let prev = makeRow();

  // Both runs are capped at OPEN, which is far past where the gate saturates.
  const timeRun = new Uint8Array(frames * bins);
  const freqRun = new Uint8Array(frames * bins);
  const support = new Uint8Array(frames * bins);

  const fwdF = new Uint8Array(bins);

  function linked(from, iFrom, to, iTo) {
    if (!from.ok[iFrom] || !to.ok[iTo]) {
      return false;
    }

    const ddt = (to.t[iTo] - from.t[iFrom]) / tau;
    const ddf = (to.f[iTo] - from.f[iFrom]) / phi;

    // Both ends have to recognise the step as their own direction. Asking only
    // the one end lets a cell claim any neighbour that happens to lie along a
    // direction nothing else agrees with.
    return offAxis(from, iFrom, ddt, ddf) < LINK_CUT && offAxis(to, iTo, ddt, ddf) < LINK_CUT;
  }

  for (let frame = 0; frame < frames; frame++) {
    const off = frame * REACH + align;

    for (let n = 0; n < winLen; n++) {
      const s = off + n;
      const v = s >= 0 && s < samples.length ? samples[s] : 0;

      re[n] = v * w[n];
      im[n] = v * tw[n];
      dRe[n] = v * dw[n];
    }

    dIm.fill(0);

    fft.transform(re, im);
    fft.transform(dRe, dIm);

    const frameCentre = off + centre;

    for (let b = 1; b < bins; b++) {
      cur.ok[b] = 0;

      const j = fftSize - b;

      const xr = (re[b] + re[j]) * 0.5;
      const xi = (im[b] - im[j]) * 0.5;
      const tr = (im[b] + im[j]) * 0.5;
      const ti = (re[j] - re[b]) * 0.5;

      const power = xr * xr + xi * xi;

      if (power < 1e-20) {
        continue;
      }

      let dt = (tr * xr + ti * xi) / power;

      if (dt > centre) {
        dt = centre;
      } else if (dt < -centre) {
        dt = -centre;
      }

      const df = -((dIm[b] * xr - dRe[b] * xi) / power) * hzPerRad;
      const run = (ti * xr - tr * xi) / power;
      const rise = ((dRe[b] * xr + dIm[b] * xi) / power) * hzPerRad;

      cur.t[b] = frameCentre + dt;
      cur.f[b] = b * binHz + df;
      cur.dx[b] = run / tau;
      cur.dy[b] = rise / phi;
      cur.dl[b] = Math.sqrt(cur.dx[b] * cur.dx[b] + cur.dy[b] * cur.dy[b]);
      cur.ok[b] = 1;
    }

    const base = frame * bins;

    // Along time: the run so far. The forward half is recovered below, once the
    // frames it needs exist.
    for (let b = 1; b < bins; b++) {
      if (frame === 0) {
        timeRun[base + b] = cur.ok[b] ? OPEN : 0;
      } else {
        const back = timeRun[base - bins + b];
        timeRun[base + b] = linked(prev, b, cur, b) ? Math.min(OPEN, back + 1) : 0;
      }
    }

    // Along frequency: the whole chain, since a frame is complete in itself.
    fwdF[bins - 1] = 0;

    for (let b = bins - 2; b >= 1; b--) {
      fwdF[b] = linked(cur, b, cur, b + 1) ? Math.min(OPEN, fwdF[b + 1] + 1) : 0;
    }

    let backF = 0;

    for (let b = 1; b < bins; b++) {
      freqRun[base + b] = Math.min(OPEN, backF + fwdF[b]);
      backF = fwdF[b] > 0 ? Math.min(OPEN, backF + 1) : 0;
    }

    const swap = prev;
    prev = cur;
    cur = swap;
  }

  // The forward half of every time chain, swept back through the map. A cell
  // links forward exactly when the next frame's backward run is non-zero, so
  // the run already stored is all this needs.
  //
  // `prev` is the last frame's row after the loop above, and the open-ended
  // credit is given only where it says there was a cell to credit. Handing it
  // out unconditionally awarded full support to every bin of the last frame,
  // which in a recording of silence was the only thing in the map.
  for (let b = 1; b < bins; b++) {
    let fwd = prev.ok[b] ? OPEN : 0; // the run continues past the end of the take

    for (let frame = frames - 1; frame >= 0; frame--) {
      const i = frame * bins + b;
      const back = timeRun[i];

      timeRun[i] = Math.min(OPEN, back + fwd);
      fwd = back > 0 ? Math.min(OPEN, fwd + 1) : 0;
    }
  }

  // Chain lengths become one gate, in resolution cells: a window of time and a
  // main lobe of frequency count for the same.
  const perLink = REACH / winLen;

  for (let i = 0; i < support.length; i++) {
    const cells = Math.max(timeRun[i] * perLink, freqRun[i] / LOBE_BINS);
    support[i] = Math.round(255 * smoothstep(SUPPORT_LO, SUPPORT_HI, cells));
  }

  // A cell sits between the map's entries — its bin is one of the padded ones,
  // its instant is between two coarse frames — so the map is spread by one step
  // in each direction and then read at the nearest entry. Without this a
  // partial loses its own lobe skirts and a click loses the frames either side
  // of it: measured on synthetic signals, a click's cells kept 94% of their
  // gate without this and 100% with it. Separable, and against the values each
  // pass found rather than the ones it has already written.
  for (let frame = 0; frame < frames; frame++) {
    const base = frame * bins;
    let before = 0;

    for (let b = 0; b < bins; b++) {
      const here = support[base + b];
      const after = b + 1 < bins ? support[base + b + 1] : 0;

      support[base + b] = Math.max(before, here, after);
      before = here;
    }
  }

  const row = new Uint8Array(bins);
  const above = new Uint8Array(bins);

  for (let frame = 0; frame < frames; frame++) {
    const base = frame * bins;

    row.set(support.subarray(base, base + bins));

    for (let b = 0; b < bins; b++) {
      const next = frame + 1 < frames ? support[base + bins + b] : 0;

      support[base + b] = Math.max(above[b], row[b], next);
    }

    above.set(row);
  }

  return {support, frames, bins};
}
