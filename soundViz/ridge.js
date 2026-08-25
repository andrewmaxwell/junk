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

// How far apart, as a fraction of the window, the two ends of a link sit.
//
// This has to be a fraction of the window and not a count of samples, and the
// reason is the whole difficulty of comparing one window length against
// another. Two frames REACH samples apart share 98% of a 4096-sample window, so
// they are very nearly the same measurement, and a chain of them proves
// nothing: white noise linked all the way across a recording that way and came
// out with 98% of the energy — the longest window claiming everything, because
// the test had been made trivial for it rather than because it explained
// anything. At a sixteenth of a window the three scales are asking the same
// question, and noise divides evenly again.
//
// A sixteenth, specifically, because that is what REACH already was for the
// base window, and REACH is what the existing numbers were measured against:
// widening it to an eighth costs speech a quarter of its gate, because vibrato
// moves a harmonic off its own measured direction over that span.
//
// The map's frames stay REACH apart whatever the window — that grid is shared
// with `reassign.js` and with the share arena — so a long window links across
// several frames of it, and its chains run on that many interleaved lattices.
const LINK_WINDOWS = 1 / 16;

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

// The share arena.
//
// Several window lengths are analysed at once, and each of them is a *complete*
// account of the sound: draw all of them at full power and the picture is three
// times as bright, which would make brightness stop meaning amplitude. So the
// energy is divided between them instead, and this is the grid the division is
// decided on.
//
// Rows are spaced evenly in sqrt(f) — not in f, which would put the whole
// 60-200 Hz region where the long window earns its keep into a single row, and
// not in log f, which would cost a logarithm per cell at lookup time. sqrt is
// one hardware instruction and lands between the two: about 9 Hz a row at 60 Hz
// and 120 Hz a row at 10 kHz, on a 48 kHz recording.
//
// Time is the ridge map's own grid — REACH samples a frame — so the arena is
// indexed by absolute instant and absolute frequency, exactly like the support
// map beside it. That is what makes it survive a zoom: a cell re-emitted by a
// finer pass reads the same share it read before.
export const SHARE_ROWS = 256;

export const rowScaleFor = (sampleRate) =>
  (SHARE_ROWS - 1) / Math.sqrt(sampleRate / 2);

// A window earns its share of the energy where it explains it. `fitness` is the
// power-weighted mean support gate over a bucket, which is already measured in
// *resolution cells* — a window of time, a main lobe of frequency — and so
// means the same thing at every window length. That scale-fairness is the whole
// reason the gate is the right quantity here and the per-cell coherence is not:
// coherence probes a neighbour REACH samples away whatever the window, which is
// a quarter of a short window and a sixteenth of a long one, and a test that
// easy for long windows would hand them everything.
//
// Raised to a power, because the differences that matter are modest. Two tones
// 60 Hz apart chain cleanly at 85 ms and loop at 21 ms; that shows up as
// fitnesses of 1.00 against 0.68, and raw those would split the energy 60/40.
// Swept: at 3 the long window takes 0.42 of that pair and aperiodic clicks go
// to the short window at 0.93; at 4, 0.47 and 0.98; at 5, 0.52 and 0.97, with
// white noise leaning further towards the long window for nothing in return.
// Four is the knee.
const FIT_GAMMA = 4;

// Added before the exponent so that a bucket where every window has given up —
// noise — divides roughly evenly rather than amplifying whichever window
// happened to score 0.02 against 0.01. Noise then draws at a fraction of its
// power in each of three places, which sums back to the noise floor it always
// was, and each fraction is gated by that window's own coherence as before. Set
// where it stops mattering: raising it further only blunts the buckets that
// have actually made up their minds, and it is the exponent above, not this,
// that decides those.
const FIT_FLOOR = 0.1;

// How far the shares are smoothed before they are used, in arena cells. Which
// window suits a stretch of sound is a broad property, and an unsmoothed share
// map hands neighbouring cells of one ridge to different windows, which reads
// as a ridge flickering along its length. Four frames is 256 samples, about
// the shortest window in play.
const BLUR_FRAMES = 4;
const BLUR_ROWS = 3;

// Power is kept per (frame, bin) only so the fitness can be power-weighted, and
// the gate it weights is not known until the chains have been walked. A byte of
// dB is ample for a weight: 1 dB steps from -200 dB, which reaches the 1e-20
// power floor the analysis already refuses to look below.
const DB_OFFSET = 200;

// The chain is asked to prove that structure continues, and the ends of the
// recording are where it cannot: a partial still sounding when the take stopped
// did not stop. A chain reaching the first or last frame therefore counts as
// unbroken rather than as ended — the same rule `reassign.js` uses when a
// neighbour is missing, where a missing side abstains rather than accuses.
// Frequency needs no such rule: DC and Nyquist really are the ends.
//
// Frequency runs are counted in bins and saturate the gate at LOBE_BINS *
// SUPPORT_HI = 24, so a byte is ample. **Time runs are counted in frames**, and
// a frame is REACH samples whatever the window — so a long window needs
// SUPPORT_HI * winLen / REACH of them, which is 384 at 4096 samples and does
// not fit in a byte. Capping there would have told the longest scale that
// nothing in the recording lasts, and since fitness is what divides the energy
// between the scales, it would have quietly handed the low end to the windows
// that cannot measure it. It was already marginal at the old WIN_MAX of 2048,
// where 255 frames is 7.97 resolution cells against a threshold of 6.
const OPEN_F = 255;

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

  return len > 1e-12
    ? Math.abs(ddt * dy - ddf * dx) / len
    : Math.sqrt(ddt * ddt + ddf * ddf);
}

export function buildRidge({samples, sampleRate, winLen, fMin, fMax}) {
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

  // Frames of the map between the two ends of one link, and the length of that
  // link in resolution cells. `perLink` is LINK_WINDOWS for every scale long
  // enough to reach it, which is the point of the whole arrangement; the
  // shortest window cannot, because the map's frames are only so close
  // together, and it links across one frame at a quarter of a window.
  const stride = Math.max(1, Math.round((LINK_WINDOWS * winLen) / REACH));
  const perLink = (stride * REACH) / winLen;

  // Chains link across `stride` frames, so the row a frame is compared against
  // is no longer the one before it, and the last frame of each of the `stride`
  // interleaved lattices is no longer the last frame of the recording. Both
  // wants are met by keeping the last `stride` rows and their `ok` flags.
  const prev = [];

  for (let i = 0; i < stride; i++) {
    prev.push(makeRow());
  }

  const okLast = new Uint8Array(stride * bins);

  // Both runs are capped where the gate has long since saturated — see OPEN_F.
  const OPEN_T = Math.min(255, Math.ceil((SUPPORT_HI + 1) / perLink));

  const timeRun = new Uint8Array(frames * bins);
  const freqRun = new Uint8Array(frames * bins);
  const support = new Uint8Array(frames * bins);

  // Power, in whole dB, kept only until the chains have been walked and the
  // gate they produce can be weighted by it.
  const pw = new Uint8Array(frames * bins);

  // Which arena row each bin falls in, and -1 for the bins this window has no
  // business speaking about. A window shorter than about one and a half cycles
  // of a frequency measures its phase out of noise, so the short windows simply
  // do not bid for the bottom of the picture — see `fMinFor` in `render.js`.
  const rowOfBin = new Int32Array(bins);
  const rowScale = rowScaleFor(sampleRate);

  for (let b = 0; b < bins; b++) {
    const f = (b * sampleRate) / fftSize;

    rowOfBin[b] =
      b >= 1 && f >= fMin && f <= fMax
        ? Math.min(SHARE_ROWS - 1, Math.round(Math.sqrt(f) * rowScale))
        : -1;
  }

  const sumP = new Float32Array(frames * SHARE_ROWS);
  const sumPG = new Float32Array(frames * SHARE_ROWS);

  const fromDb = new Float32Array(256);

  for (let i = 0; i < 256; i++) {
    fromDb[i] = 10 ** ((i - DB_OFFSET) / 10);
  }

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
    return (
      offAxis(from, iFrom, ddt, ddf) < LINK_CUT &&
      offAxis(to, iTo, ddt, ddf) < LINK_CUT
    );
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

      pw[frame * bins + b] = Math.min(
        255,
        Math.max(0, Math.round(10 * Math.log10(power) + DB_OFFSET)),
      );
    }

    const base = frame * bins;

    // Along time: the run so far, on this frame's own lattice — the frame
    // `stride` back, not the one before it. The forward half is recovered
    // below, once the frames it needs exist.
    const was = prev[frame % stride];

    for (let b = 1; b < bins; b++) {
      if (frame < stride) {
        timeRun[base + b] = cur.ok[b] ? OPEN_T : 0;
      } else {
        const run = timeRun[base - stride * bins + b];
        timeRun[base + b] = linked(was, b, cur, b)
          ? Math.min(OPEN_T, run + 1)
          : 0;
      }
    }

    // Along frequency: the whole chain, since a frame is complete in itself.
    fwdF[bins - 1] = 0;

    for (let b = bins - 2; b >= 1; b--) {
      fwdF[b] = linked(cur, b, cur, b + 1)
        ? Math.min(OPEN_F, fwdF[b + 1] + 1)
        : 0;
    }

    let backF = 0;

    for (let b = 1; b < bins; b++) {
      freqRun[base + b] = Math.min(OPEN_F, backF + fwdF[b]);
      backF = fwdF[b] > 0 ? Math.min(OPEN_F, backF + 1) : 0;
    }

    okLast.set(cur.ok, (frame % stride) * bins);

    const swap = prev[frame % stride];
    prev[frame % stride] = cur;
    cur = swap;
  }

  // The forward half of every time chain, swept back through the map. A cell
  // links forward exactly when the next frame's backward run is non-zero, so
  // the run already stored is all this needs.
  //
  // One sweep per lattice, since a chain only ever steps `stride` frames.
  // `okLast` holds the last frame of each of them, and the open-ended credit is
  // given only where it says there was a cell to credit. Handing it out
  // unconditionally awarded full support to every bin of the last frame, which
  // in a recording of silence was the only thing in the map.
  for (let lattice = 0; lattice < stride; lattice++) {
    const last = frames - 1 - ((frames - 1 - lattice + stride) % stride);

    if (last < 0) {
      continue;
    }

    for (let b = 1; b < bins; b++) {
      // The run continues past the end of the take.
      let fwd = okLast[(last % stride) * bins + b] ? OPEN_T : 0;

      for (let frame = last; frame >= 0; frame -= stride) {
        const i = frame * bins + b;
        const run = timeRun[i];

        timeRun[i] = Math.min(OPEN_T, run + fwd);
        fwd = run > 0 ? Math.min(OPEN_T, fwd + 1) : 0;
      }
    }
  }

  // Chain lengths become one gate, in resolution cells: a window of time and a
  // main lobe of frequency count for the same.
  //
  // The same sweep collects this window's *fitness*: the power-weighted mean of
  // that gate over each cell of the share arena. The gate before it is spread,
  // not after — the spreading exists so that a cell sitting between two entries
  // still gets credit, which is a question about drawing, whereas fitness is a
  // question about how well this window explained the energy that was actually
  // measured here.
  for (let frame = 0; frame < frames; frame++) {
    const base = frame * bins;
    const rbase = frame * SHARE_ROWS;

    support[base] = 0;

    for (let b = 1; b < bins; b++) {
      const i = base + b;
      const cells = Math.max(timeRun[i] * perLink, freqRun[i] / LOBE_BINS);
      const gate = smoothstep(SUPPORT_LO, SUPPORT_HI, cells);

      support[i] = Math.round(255 * gate);

      const row = rowOfBin[b];

      if (row >= 0) {
        const p = fromDb[pw[i]];

        sumP[rbase + row] += p;
        sumPG[rbase + row] += p * gate;
      }
    }
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

  return {support, frames, bins, sumP, sumPG};
}

// A box blur along one axis of an arena-shaped array, in place. Separable, so
// this is called once per axis; a box is not a Gaussian but the thing being
// smoothed is a soft decision about which window suits a region of the picture,
// and its exact profile matters less than that it has one.
function blurAxis(a, lines, inner, step, jump, radius) {
  const line = new Float32Array(inner);
  const width = 2 * radius + 1;

  for (let o = 0; o < lines; o++) {
    const base = o * jump;

    for (let i = 0; i < inner; i++) {
      line[i] = a[base + i * step];
    }

    let sum = 0;

    for (let i = 0; i <= radius; i++) {
      sum += line[Math.min(inner - 1, i)];
    }

    // Edges repeat rather than fade to zero: the recording ending is not a
    // reason for a window to stop suiting the sound.
    sum += line[0] * radius;

    for (let i = 0; i < inner; i++) {
      a[base + i * step] = sum / width;
      sum -= line[Math.max(0, i - radius)];
      sum += line[Math.min(inner - 1, i + radius + 1)];
    }
  }
}

// Divide the energy between the window lengths.
//
// Each scale arrives with two arena-shaped accumulators: how much power it saw
// in each cell, and how much of that power sat on a ridge that went somewhere.
// The ratio is its fitness there. Raised to FIT_GAMMA, floored, weighted by the
// prior below and normalised, the fitnesses become shares that sum to one — so
// the several analyses drawn on top of each other carry exactly the energy one
// of them would have, and brightness goes on meaning amplitude.
//
// A scale that saw no power at all in a cell — because the cell is below the
// lowest frequency its window can measure — takes no share rather than a
// floored one. That is the difference between "this window has nothing to say
// here" and "no window has anything to say here", and only the second is a
// reason to divide evenly.
//
// `priors` breaks the ties, and it is each scale's share of the *cells*. A
// plain tone is explained perfectly by every window that can see it, so on
// fitness alone the three would draw the same hairline three times over — one
// line paid for three times, out of a budget that is split three ways. The
// prior hands such a tie to the window with the cells to draw it: at [1, 2, 1]
// the base scale carries half of an undecided pixel and the flanks a quarter
// each, which is exactly the ratio of cells they have to spend on it. Power and
// cells then run out together, so a scale whose strokes have stopped meeting is
// also a scale carrying little of the energy, and its dashes are faint rather
// than conspicuous.
//
// Where a window genuinely fits better the prior is beside the point: a factor
// of two against a fitness ratio raised to the fourth decides nothing.
// Aperiodic clicks still go to the short window at 0.98 against 0.02 and 0.00.
//
// The accumulators are blurred, not the shares. Blurring first and dividing
// afterwards keeps the sum at exactly one, which blurring three ratios
// separately would not.
export function blendScales(parts, frames, priors) {
  const n = frames * SHARE_ROWS;
  const S = parts.length;

  for (const part of parts) {
    for (const a of [part.sumP, part.sumPG]) {
      blurAxis(a, frames, SHARE_ROWS, 1, SHARE_ROWS, BLUR_ROWS);
      blurAxis(a, SHARE_ROWS, frames, SHARE_ROWS, 1, BLUR_FRAMES);
    }
  }

  const share = parts.map(() => new Uint8Array(n));
  const w = new Float64Array(S);

  // How much energy each bucket holds, alongside how it is divided. The shares
  // alone cannot say whether a scale is worth analysing at a given viewport —
  // half of nothing is still nothing — so `render.js` weights them by this.
  // Every scale is a complete account of the sound, so their totals agree to
  // within the blur and the mean is the honest one to keep.
  const power = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    let total = 0;
    let sum = 0;

    for (let s = 0; s < S; s++) {
      const p = parts[s].sumP[i];

      sum += p;
      w[s] =
        p > 0
          ? priors[s] * (parts[s].sumPG[i] / p + FIT_FLOOR) ** FIT_GAMMA
          : 0;
      total += w[s];
    }

    power[i] = sum / S;

    if (total <= 0) {
      continue;
    }

    for (let s = 0; s < S; s++) {
      share[s][i] = Math.round((255 * w[s]) / total);
    }
  }

  return {share, power};
}
