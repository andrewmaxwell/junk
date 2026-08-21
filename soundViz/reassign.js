import {FFT} from './fft.js';

// Reassigned spectrogram, as a cloud of cells rather than a grid.
//
// Each cell is a scrap of energy that the phase of the STFT says belongs at a
// particular instant and a particular frequency — not at the centre of the bin
// it happened to land in. Alongside those two numbers we recover the direction
// the underlying ridge is travelling in, so a cell can be drawn as a short
// oriented stroke along its ridge instead of an isolated dot.
//
// Keeping the cloud rather than a grid is what makes zooming worthwhile: the
// positions are exact, so re-projecting into a magnified viewport shows real
// structure rather than magnified pixels.
//
// Cell layout, stride 5:
//   [0] t     instant, in samples from the start of the take
//   [1] f     frequency, Hz
//   [2] p     power, normalised so a given sound reads the same at any settings
//   [3] a     ridge direction, atan2(rise in Hz, run in samples)
//   [4] c     coherence, 0..1 — see below
//
// Cells come out in frame order, and a frame's cells all lie within half a
// window of its centre. Recording where each frame's cells begin therefore
// turns "draw the visible stretch" into a single contiguous range of the
// buffer, which is what lets one very large cloud be panned around cheaply.

export const STRIDE = 5;

// Cells are handed back in batches rather than all at once. A second of audio
// analysed at full density is several million of them — more than is worth
// holding in memory on a phone — and every consumer either draws them straight
// away or keeps a thinned copy, so nothing needs the whole cloud at once.
const CHUNK = 1 << 18;

// Coherence.
//
// A real one-dimensional structure — tone, chirp, click — is measured many
// times over: every bin its lobe spreads across, every frame whose window
// covers it. All of those estimates land on the same ridge, and the
// displacement from one to the next lies *along* the direction this cell
// itself measured. So each cell is asked whether its neighbours corroborate
// it: the residual of the neighbour displacement perpendicular to the cell's
// own ridge direction, pushed through a Gaussian, is the coherence.
//
// One neighbour is not enough. Measured on synthetic signals, the neighbouring
// *bin* alone acquits noise and window sidelobes but also acquits the looping
// filaments that reassignment hangs between two components sharing a window —
// the loops are locally smooth, so along frequency they corroborate each
// other. The neighbouring *instant* is what convicts them: the loop wanders
// off the measured direction as time advances. Both tests have to pass —
// coherence takes the worse of the two residuals. Power-weighted mean
// coherence, measured: clean tone/chirp/click ~1.0, two-component loops
// ~0.15, white noise ~0.06, sidelobes ~0.
//
// Both comparisons are pinned to *absolute* distances so the answer does not
// depend on which analysis pass computed it — the same nesting guarantee the
// positions have. Along frequency the neighbour is one unpadded bin away
// (padding leaves those bins exactly where they were); along time it is
// COHERENCE_REACH samples away, whatever the hop. A refining pass therefore
// reproduces the coherence of every cell it re-emits, and the picture does not
// restate itself on zoom.
const COHERENCE_SIGMA = 0.15;
const COHERENCE_REACH = 64; // samples; ~1.3 ms at 48 kHz

export function analyzeCells({
  samples,
  sampleRate,
  winLen,
  fftSize,
  hop,
  frames,
  tStart,
  fMin,
  fMax,
  onCells,
}) {
  const fft = new FFT(fftSize);
  const centre = (winLen - 1) / 2;
  const align = -(winLen >> 1);

  const w = new Float32Array(winLen);
  const tw = new Float32Array(winLen);
  const dw = new Float32Array(winLen);

  let winSum = 0;

  for (let n = 0; n < winLen; n++) {
    const phase = (2 * Math.PI * n) / winLen;

    w[n] = 0.5 - 0.5 * Math.cos(phase);

    // Time-ramped window.
    tw[n] = (n - centre) * w[n];

    // Derivative of the Hann window.
    dw[n] = (Math.PI / winLen) * Math.sin(phase);

    winSum += w[n];
  }

  // Coherent gain, then one correction: zero padding samples the same spectrum
  // more finely, so the main lobe of a partial is spread over `fftSize/winLen`
  // times as many bins, all of which reassign onto the same ridge. Without
  // dividing it out, padding would make the picture brighter rather than finer.
  //
  // Nothing here depends on the hop, and that is deliberate. Halving the hop
  // doubles the cells along a ridge but also halves the gap between them, and
  // the renderer divides by how many strokes cover a pixel — so the brightness
  // already comes out the same, and dividing again here would make a ridge fade
  // every time it was sampled more finely. That is what used to make the
  // picture change colour on zoom.
  const scale = (2 / winSum) ** 2 / (fftSize / winLen);

  const bins = fftSize / 2;
  const binHz = sampleRate / fftSize;
  const hzPerRad = sampleRate / (2 * Math.PI);

  // Normalising scales for the coherence residual, fixed by the window alone
  // so no pass can recolour cells another pass emitted.
  const step = fftSize / winLen; // one unpadded bin, in padded bins
  const tau = winLen / 4; // time scale, samples
  const phi = sampleRate / winLen; // frequency scale: one unpadded bin, Hz
  const sigmaNorm = 1 / (2 * COHERENCE_SIGMA * COHERENCE_SIGMA);
  const rCut = 4 * COHERENCE_SIGMA;

  // The cross-frame comparison needs frames COHERENCE_REACH samples away in
  // both directions, so frames pass through a ring and are emitted D frames
  // behind the analysis.
  const D = Math.max(1, Math.round(COHERENCE_REACH / hop));
  const R = 2 * D + 1;

  const slot = [];

  for (let i = 0; i < R; i++) {
    slot.push({
      t: new Float32Array(bins),
      f: new Float32Array(bins),
      run: new Float32Array(bins),
      rise: new Float32Array(bins),
      p: new Float32Array(bins),
      ok: new Uint8Array(bins),
    });
  }

  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  const dRe = new Float32Array(fftSize);
  const dIm = new Float32Array(fftSize);

  const cells = new Float32Array(CHUNK * STRIDE);

  const starts = new Uint32Array(frames + 1);

  let count = 0;
  let total = 0;

  // Residual of a neighbour's displacement perpendicular to this cell's
  // direction (dx, dy), all in normalised units. With no usable direction,
  // plain distance: an isolated dot needs a coincident neighbour to score.
  function residual(dx, dy, dlen, ddt, ddf) {
    return dlen > 1e-12 ? Math.abs(ddt * dy - ddf * dx) / dlen : Math.hypot(ddt, ddf);
  }

  function emit(e, computed) {
    starts[e] = total + count;

    const cur = slot[e % R];
    const back = e - D >= 0 ? slot[(e - D) % R] : null;
    const fwd = e + D <= computed ? slot[(e + D) % R] : null;

    for (let b = 1; b < bins; b++) {
      if (!cur.ok[b]) {
        continue;
      }

      const f = cur.f[b];

      if (f <= fMin || f >= fMax) {
        continue;
      }

      const dx = cur.run[b] / tau;
      const dy = cur.rise[b] / phi;
      const dlen = Math.hypot(dx, dy);

      // Along frequency: the better of the two unpadded-bin neighbours — a
      // cell at the edge of a lobe has one good neighbour and one that is
      // pure floor, and that should not convict it.
      let rB = Infinity;

      for (let s = -step; s <= step; s += 2 * step) {
        const nb = b + s;

        if (nb < 1 || nb >= bins || !cur.ok[nb]) {
          continue;
        }

        const r = residual(dx, dy, dlen, (cur.t[nb] - cur.t[b]) / tau, (cur.f[nb] - cur.f[b]) / phi);

        if (r < rB) {
          rB = r;
        }
      }

      // Along time: the better of the two frames COHERENCE_REACH away.
      let rF = Infinity;

      for (let side = 0; side < 2; side++) {
        const nb = side === 0 ? back : fwd;

        if (!nb || !nb.ok[b]) {
          continue;
        }

        const r = residual(dx, dy, dlen, (nb.t[b] - cur.t[b]) / tau, (nb.f[b] - cur.f[b]) / phi);

        if (r < rF) {
          rF = r;
        }
      }

      // Both tests have to pass; a missing side abstains rather than accuses.
      const r = Math.max(rB === Infinity ? 0 : rB, rF === Infinity ? 0 : rF);

      const conf = r > rCut ? 0 : Math.exp(-r * r * sigmaNorm);

      if (count === CHUNK) {
        onCells(cells, count);
        total += count;
        count = 0;
      }

      const at = count * STRIDE;

      cells[at] = cur.t[b];
      cells[at + 1] = f;
      cells[at + 2] = cur.p[b];
      cells[at + 3] = Math.atan2(cur.rise[b], cur.run[b]);
      cells[at + 4] = conf;

      count++;
    }
  }

  for (let frame = 0; frame < frames; frame++) {
    // hop is always a whole number of samples (render.js quantises it to a
    // power of two, floored at 1), so this rounding is only defensive.
    const off = tStart + Math.round(frame * hop) + align;

    for (let n = 0; n < winLen; n++) {
      const s = off + n;

      const v = s >= 0 && s < samples.length ? samples[s] : 0;

      re[n] = v * w[n];
      im[n] = v * tw[n];
      dRe[n] = v * dw[n];
    }

    re.fill(0, winLen);
    im.fill(0, winLen);
    dRe.fill(0, winLen);
    dIm.fill(0);

    // Two real sequences packed into one complex transform, unpacked per bin
    // below; the derivative window needs a transform of its own.
    fft.transform(re, im);
    fft.transform(dRe, dIm);

    const frameCentre = off + centre;
    const cur = slot[frame % R];

    for (let b = 1; b < bins; b++) {
      cur.ok[b] = 0;

      const j = fftSize - b;

      // The ordinary windowed transform.
      const xr = (re[b] + re[j]) * 0.5;
      const xi = (im[b] - im[j]) * 0.5;

      // The time-ramped transform.
      const tr = (im[b] + im[j]) * 0.5;
      const ti = (re[j] - re[b]) * 0.5;

      const power = xr * xr + xi * xi;

      if (power < 1e-20) {
        continue;
      }

      // Re{X_tw / X} — displacement in samples from the window centre.
      let dt = (tr * xr + ti * xi) / power;

      // Numerical noise must not fling a cell outside its own window.
      if (dt > centre) {
        dt = centre;
      } else if (dt < -centre) {
        dt = -centre;
      }

      // -Im{X_dw / X} — displacement in Hz from the bin centre.
      const df = -((dIm[b] * xr - dRe[b] * xi) / power) * hzPerRad;

      // Ridge direction. For a signal that is locally a linear chirp,
      //
      //   X_dw / X = -i(wi - w) - i*q*(X_tw / X)
      //
      // where q is the chirp rate. The first term is purely imaginary, so
      // taking real parts leaves Re{X_dw/X} = q * Im{X_tw/X}: the chirp rate is
      // a ratio of two quantities already in hand, at the cost of no extra
      // transform. Carrying them as a *pair* rather than dividing keeps the
      // degenerate cases finite — a steady tone has zero rise and a click has
      // zero run, and a ratio would blow up on one or the other.
      const run = (ti * xr - tr * xi) / power; // Im{X_tw / X}, samples
      const rise = (dRe[b] * xr + dIm[b] * xi) / power; // Re{X_dw / X}, rad/sample

      cur.t[b] = frameCentre + dt;
      cur.f[b] = b * binHz + df;
      cur.run[b] = run;
      cur.rise[b] = rise * hzPerRad;
      cur.p[b] = power * scale;
      cur.ok[b] = 1;
    }

    if (frame >= D) {
      emit(frame - D, frame);
    }
  }

  // The tail of the pipeline: frames whose forward neighbour never arrived.
  for (let e = Math.max(0, frames - D); e < frames; e++) {
    emit(e, frames - 1);
  }

  starts[frames] = total + count;

  if (count > 0) {
    onCells(cells, count);
    total += count;
  }

  return {total, starts};
}
