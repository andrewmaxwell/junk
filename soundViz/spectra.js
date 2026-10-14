import {FFT} from './fft.js';
import {BandDFT, bandCost} from './czt.js';

// One frame of the reassigned STFT, for a band of bins. Shared by the analysis
// (`reassign.js`) and the ridge map (`ridge.js`), which must agree on every
// number they compute: the map is looked up by the cells the analysis emits.
//
// Each frame takes three transforms' worth of information from two: the
// windowed transform `X`, the time-ramped one `X_tw` and the window-derivative
// one `X_dw`. From them, per bin:
//
//   t     Re{X_tw / X} — where in time the energy belongs, in samples
//   f     -Im{X_dw / X} — where in frequency, in Hz
//   run   Im{X_tw / X}, samples, and
//   rise  Re{X_dw / X}, Hz per sample: for a locally linear chirp,
//         Re{X_dw/X} = q · Im{X_tw/X}, so the ridge direction costs no extra
//         transform. Carried as a pair rather than divided, because a steady
//         tone has zero rise and a click has zero run.
//   p     power, times whatever gain the caller asks for
//
// Two ways to get the spectra, and the caller picks — see `bandCost` in
// `render.js`.
//
// The FFT computes the whole zero-padded spectrum and keeps the band: two real
// windows packed into one transform, the derivative window in another. Every
// full view uses this, and the arithmetic is exactly what it always was, so
// its cells are unchanged to the bit.
//
// The chirp-z computes only the band, which at a deep zoom is a few hundred
// bins of a quarter-million. And it needs two transforms rather than three,
// because a periodic Hann window is three complex exponentials: w = 1/2 -
// e^{iθn}/4 - e^{-iθn}/4 with θ = 2π/winLen, and multiplying by e^{iθn} shifts a
// spectrum by exactly `step` padded bins. So with X the spectrum of the bare
// frame and Q that of the frame times (n - centre),
//
//   X_w[k]  = X[k]/2 - (X[k-step] + X[k+step])/4
//   X_tw[k] = the same of Q
//   X_dw[k] = (π/winLen) (X[k-step] - X[k+step]) / 2i
//
// which is exact, not an approximation: it is the same three windows. So the
// band is computed `step` wider on each side and the windows applied after.
// Sliding beats transforming afresh when the hop is small: a step costs a few
// operations per bin per sample, a transform four FFTs of the band. So a grid
// slides when `hop` steps across its band cost less than one transform does
// (`bandCost`, which counts one of the two). Measured on the M4 over a whole
// region, cells included, at `winLen` 1024 and 2560 bins: 4.4x faster at a hop
// of 1, 3.0x at 4, 1.8x at 16, 1.2x at 32 — the last the rule still takes.
//
// Every `SLIDE_ANCHOR` frames, on the grid's own lattice, a frame is
// transformed exactly instead, so rounding cannot accumulate past that and a
// frame never depends on where in the grid a caller began. The cells sliding
// emits come out bit-identical to the exact ones in practice: the drift is
// around 1e-12 of the band's level, far under float32.
export const SLIDE_ANCHOR = 64;

export class Spectra {
  // Bins `lo` to `hi - 1` of a `fftSize`-point transform of `winLen` samples.
  // `hop`, when the caller will step through frames that far apart, lets the
  // chirp-z path slide from one frame to the next instead — see `slide`.
  constructor({winLen, fftSize, sampleRate, lo, hi, chirp = false, hop = 0}) {
    this.winLen = winLen;
    this.fftSize = fftSize;
    this.lo = lo;
    this.hi = hi;
    this.chirp = chirp;

    this.centre = (winLen - 1) / 2;
    this.binHz = sampleRate / fftSize;
    this.hzPerRad = sampleRate / (2 * Math.PI);
    this.step = fftSize / winLen; // one unpadded bin, in padded bins

    const w = new Float32Array(winLen);
    const tw = new Float32Array(winLen);
    const dw = new Float32Array(winLen);

    let winSum = 0;

    for (let n = 0; n < winLen; n++) {
      const phase = (2 * Math.PI * n) / winLen;

      w[n] = 0.5 - 0.5 * Math.cos(phase);

      // Time-ramped window.
      tw[n] = (n - this.centre) * w[n];

      // Derivative of the Hann window.
      dw[n] = (Math.PI / winLen) * Math.sin(phase);

      winSum += w[n];
    }

    this.w = w;
    this.tw = tw;
    this.dw = dw;

    // The window's coherent gain, for callers that normalise power by it.
    this.winSum = winSum;

    if (chirp) {
      const k0 = lo - this.step;
      const kw = hi - lo + 2 * this.step;

      this.k0 = k0;
      this.dft = new BandDFT(winLen, fftSize, k0, kw);
      this.bRe = new Float64Array(kw);
      this.bIm = new Float64Array(kw);
      this.qRe = new Float64Array(kw);
      this.qIm = new Float64Array(kw);
      this.ramp = new Float64Array(winLen);
      this.dwGain = Math.PI / winLen / 2;

      for (let n = 0; n < winLen; n++) {
        this.ramp[n] = n - this.centre;
      }

      // Sliding, where it is cheaper than transforming: per bin, a one-sample
      // step turns the window's phase back by e^{2πik/N}, and the sample that
      // enters at the far end comes in at e^{-2πik/pad}. Both reduced exactly
      // before they become angles, as the chirps in `czt.js` are.
      if (hop > 0 && hop * kw <= bandCost(winLen, kw)) {
        this.hop = hop;
        this.rotRe = new Float64Array(kw);
        this.rotIm = new Float64Array(kw);
        this.endRe = new Float64Array(kw);
        this.endIm = new Float64Array(kw);

        const pad = fftSize / winLen;

        for (let i = 0; i < kw; i++) {
          const k = k0 + i;
          const a =
            (2 * Math.PI * (((k % fftSize) + fftSize) % fftSize)) / fftSize;
          const e = (-2 * Math.PI * (((k % pad) + pad) % pad)) / pad;

          this.rotRe[i] = Math.cos(a);
          this.rotIm[i] = Math.sin(a);
          this.endRe[i] = Math.cos(e);
          this.endIm[i] = Math.sin(e);
        }
      }

      this.last = -2; // the frame index the spectra above belong to
    } else {
      this.fft = new FFT(fftSize);
      this.re = new Float32Array(fftSize);
      this.im = new Float32Array(fftSize);
      this.dRe = new Float32Array(fftSize);
      this.dIm = new Float32Array(fftSize);
    }
  }

  // The frame whose window starts at sample `off` (zero off either end of the
  // recording). Writes `ok`, `t`, `f`, `run`, `rise` and `p` into `out` at
  // index `b - lo`; a bin with no power to speak of gets `ok = 0` and nothing
  // else. The caller chooses the arrays' types, and so the precision each
  // number is kept at.
  //
  // `index` is the frame's place on the caller's grid. Given it, and a hop to
  // slide by, consecutive frames are slid rather than transformed, except on
  // the anchors every `SLIDE_ANCHOR` frames, which are always transformed —
  // so a frame's numbers depend only on its place on the grid and never on
  // where a caller started, which is what keeps regions invisible.
  frame(samples, off, out, gain = 1, index) {
    const {winLen, fftSize, lo, hi, chirp, centre, binHz, hzPerRad} = this;

    if (chirp) {
      if (this.hop && index === this.last + 1 && index % SLIDE_ANCHOR !== 0) {
        this.slide(samples, off - this.hop);
      } else {
        this.dft.transform(samples, off, null, this.bRe, this.bIm);
        this.dft.transform(samples, off, this.ramp, this.qRe, this.qIm);
      }

      this.last = index ?? -2;
    } else {
      const {w, tw, dw, re, im, dRe, dIm} = this;

      for (let n = 0; n < winLen; n++) {
        const s = off + n;

        const v = s >= 0 && s < samples.length ? samples[s] : 0;

        re[n] = v * w[n];
        im[n] = v * tw[n];
        dRe[n] = v * dw[n];
      }

      // Only the imaginary half of the derivative transform needs clearing:
      // everything past `winLen` is zero padding the transform is told about
      // rather than made to read, and every other input slot below it was
      // just written.
      dIm.fill(0, 0, winLen);

      // Two real sequences packed into one complex transform, unpacked per bin
      // below; the derivative window needs a transform of its own.
      this.fft.transform(re, im, winLen);
      this.fft.transform(dRe, dIm, winLen);
    }

    const {re, im, dRe, dIm, bRe, bIm, qRe, qIm, k0, step, dwGain} = this;
    const frameCentre = off + centre;

    for (let b = lo; b < hi; b++) {
      const i = b - lo;

      out.ok[i] = 0;

      let xr, xi, tr, ti, dr, di;

      if (chirp) {
        const m = b - k0;
        const lm = m - step;
        const hm = m + step;

        xr = 0.5 * bRe[m] - 0.25 * (bRe[lm] + bRe[hm]);
        xi = 0.5 * bIm[m] - 0.25 * (bIm[lm] + bIm[hm]);
        tr = 0.5 * qRe[m] - 0.25 * (qRe[lm] + qRe[hm]);
        ti = 0.5 * qIm[m] - 0.25 * (qIm[lm] + qIm[hm]);
        dr = dwGain * (bIm[lm] - bIm[hm]);
        di = -dwGain * (bRe[lm] - bRe[hm]);
      } else {
        const j = fftSize - b;

        xr = (re[b] + re[j]) * 0.5;
        xi = (im[b] - im[j]) * 0.5;
        tr = (im[b] + im[j]) * 0.5;
        ti = (re[j] - re[b]) * 0.5;
        dr = dRe[b];
        di = dIm[b];
      }

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
      const df = -((di * xr - dr * xi) / power) * hzPerRad;

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
      out.t[i] = frameCentre + dt;
      out.f[i] = b * binHz + df;
      out.run[i] = (ti * xr - tr * xi) / power;
      out.rise[i] = ((dr * xr + di * xi) / power) * hzPerRad;
      out.p[i] = power * gain;
      out.ok[i] = 1;
    }
  }

  // Move the bare and the time-ramped spectra on by `hop` samples, from the
  // window that started at `from`. With E = e^{-2πik/N}, X the bare spectrum
  // and Q the ramped one, one sample in and one out is
  //
  //   X' = E^{-1} (X - x[m] + x[m+L] E^L)
  //   Q' = E^{-1} (Q - X + (c+1) x[m] + (L-1-c) x[m+L] E^L)
  //
  // where m is where the old window started, L its length and c its centre.
  // A few operations a bin, against four FFTs of the whole band for a fresh
  // transform. The error of a step is a rounding of a double; over the
  // `SLIDE_ANCHOR` frames between transforms it stays below 1e-12 of the
  // band's level, measured.
  slide(samples, from) {
    const {
      winLen,
      centre,
      hop,
      bRe,
      bIm,
      qRe,
      qIm,
      rotRe,
      rotIm,
      endRe,
      endIm,
    } = this;
    const n = samples.length;
    const kw = bRe.length;
    const a = 1 + centre;
    const b = winLen - 1 - centre;

    for (let s = 0; s < hop; s++) {
      const m = from + s;
      const x0 = m >= 0 && m < n ? samples[m] : 0;
      const x1 = m + winLen >= 0 && m + winLen < n ? samples[m + winLen] : 0;

      for (let i = 0; i < kw; i++) {
        const xr = bRe[i];
        const xi = bIm[i];
        const er = x1 * endRe[i];
        const ei = x1 * endIm[i];

        const ur = xr - x0 + er;
        const ui = xi + ei;
        const vr = qRe[i] - xr + a * x0 + b * er;
        const vi = qIm[i] - xi + b * ei;

        const cr = rotRe[i];
        const ci = rotIm[i];

        bRe[i] = ur * cr - ui * ci;
        bIm[i] = ur * ci + ui * cr;
        qRe[i] = vr * cr - vi * ci;
        qIm[i] = vr * ci + vi * cr;
      }
    }
  }
}
