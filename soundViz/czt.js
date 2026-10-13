import {FFT} from './fft.js';

// The DFT of an `L`-sample sequence, zero padded to `N`, at the `M` bins from
// `k0` — without computing the other N - M.
//
// A deep zoom keeps a few hundred bins of a 262144-point transform, and a
// zero-padded FFT computes all of them whatever is kept. Bluestein's identity,
// kn = (k² + n² - (k - n)²) / 2, turns the bins wanted into a convolution with a
// chirp, and a convolution of `L + M - 1` points is two FFTs of that size, so
// the cost follows the band rather than `N`. `N` need not even be affordable.
//
// For k = k0 + m:
//
//   X[k] = e^{-πi m²/N} · Σ_n ( s[n] e^{-πi (n² + 2 k0 n)/N} ) e^{πi (m - n)²/N}
//
// Every phase is an integer over N, reduced mod 2N before it becomes an angle,
// so the chirps stay exact however large N and the indices get. The arithmetic
// is Float64 throughout: three FFTs run end to end, and at these sizes the
// precision is free.
export class BandDFT {
  constructor(L, N, k0, M) {
    let P = 1;

    while (P < L + M - 1) {
      P *= 2;
    }

    this.L = L;
    this.M = M;
    this.P = P;
    this.fft = new FFT(P, Float64Array);

    const twoN = 2 * N;

    // e^{-πi q / N}, for an integer q.
    const angle = (q) => (-Math.PI * (((q % twoN) + twoN) % twoN)) / N;

    this.preRe = new Float64Array(L);
    this.preIm = new Float64Array(L);

    for (let n = 0; n < L; n++) {
      const a = angle(n * n + 2 * k0 * n);
      this.preRe[n] = Math.cos(a);
      this.preIm[n] = Math.sin(a);
    }

    this.postRe = new Float64Array(M);
    this.postIm = new Float64Array(M);

    for (let m = 0; m < M; m++) {
      const a = angle(m * m);
      this.postRe[m] = Math.cos(a);
      this.postIm[m] = Math.sin(a);
    }

    // The chirp being convolved with, e^{+πi j²/N} for j from -(L-1) to M-1,
    // laid out circularly: the negative lags wrap to the top of the buffer. P is
    // at least L + M - 1, so no lag that matters overlaps another. Transformed
    // once here, with the inverse transform's 1/P folded in.
    const kRe = new Float64Array(P);
    const kIm = new Float64Array(P);

    for (let j = 0; j < M; j++) {
      const a = -angle(j * j);
      kRe[j] = Math.cos(a);
      kIm[j] = Math.sin(a);
    }

    for (let j = 1; j < L; j++) {
      const a = -angle(j * j);
      kRe[P - j] = Math.cos(a);
      kIm[P - j] = Math.sin(a);
    }

    this.fft.transform(kRe, kIm);

    for (let i = 0; i < P; i++) {
      kRe[i] /= P;
      kIm[i] /= P;
    }

    this.kRe = kRe;
    this.kIm = kIm;

    this.re = new Float64Array(P);
    this.im = new Float64Array(P);
  }

  // `samples[off + n] * gain[n]` for n < L, read as zero off either end of the
  // recording; `gain` may be null. Writes the M bins into `outRe`, `outIm`.
  transform(samples, off, gain, outRe, outIm) {
    const {L, M, P, re, im, preRe, preIm, kRe, kIm, postRe, postIm} = this;

    for (let n = 0; n < L; n++) {
      const s = off + n;
      let v = s >= 0 && s < samples.length ? samples[s] : 0;

      if (gain) {
        v *= gain[n];
      }

      re[n] = v * preRe[n];
      im[n] = v * preIm[n];
    }

    // Everything from L up is zero, which the forward transform is told
    // rather than made to read — see `FFT.transform`.
    this.fft.transform(re, im, L);

    // Multiply by the chirp's spectrum, then invert by conjugation:
    // ifft(Z) = conj(fft(conj(Z))) / P, with the 1/P already in the kernel.
    for (let i = 0; i < P; i++) {
      const r = re[i] * kRe[i] - im[i] * kIm[i];
      const m = re[i] * kIm[i] + im[i] * kRe[i];
      re[i] = r;
      im[i] = -m;
    }

    this.fft.transform(re, im);

    for (let m = 0; m < M; m++) {
      const zr = re[m];
      const zi = -im[m];
      outRe[m] = zr * postRe[m] - zi * postIm[m];
      outIm[m] = zr * postIm[m] + zi * postRe[m];
    }
  }
}

// What one `BandDFT.transform` costs, in the same butterfly units as an FFT's
// `n * log2(n)`: a forward transform pruned to `log2(L)` live stages, then a
// full inverse. `render.js` uses it to decide which way a grid is computed.
export function bandCost(L, M) {
  let P = 1;

  while (P < L + M - 1) {
    P *= 2;
  }

  return P * (Math.log2(L) + Math.log2(P));
}
