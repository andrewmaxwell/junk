// Hearing the part of the picture you are looking at.
//
// The viewport is a rectangle in time and frequency, so playing it means two
// clips: one along time, which is a slice of the samples, and one along
// frequency, which is a filter. The filter is the interesting half — deep into
// a zoom the visible band can be a fraction of a hertz wide, and no practical
// cascade of biquads has a skirt that steep. An overlap-add STFT does: take the
// transform, zero every bin outside the band, come back. `fft.js` is already
// here and already does the hard part.

import {FFT} from './fft.js';

// A viewport can be 24 samples across. Played as-is that is half a millisecond
// of sound, and looped it would just be a buzz at the loop rate — a pitch
// invented by the loop length rather than anything in the recording. So a clip
// is widened to at least this before it is played, and the caller is told when
// that happened.
const MIN_PLAY_MS = 120;

// The band wants enough bins across it to be a band rather than a single line.
// Below this the filter rings badly and the result reads as a sine whatever the
// content was.
const MIN_BAND_BINS = 4;

const MIN_FILTER_FFT = 512;
const MAX_FILTER_FFT = 32768;

// Hann at three-quarters overlap. The synthesis divides by the summed square of
// the window rather than relying on a COLA constant, so this is free to change.
const OVERLAP = 4;

// Raised cosine at each end of the clip. The same reasoning as `FADE_SEC` in
// `recorder.js`: a hard cut is a step, and a step is broadband — which here
// would be an audible tick on every pass of the loop.
const EDGE_FADE_SEC = 0.005;

let current = null;

function hann(n) {
  const w = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }

  return w;
}

// Enough resolution to put a few bins inside the band being asked for. A wide
// band needs nothing special; a hairline one at 200x needs a long transform.
function filterSize(sampleRate, f0, f1) {
  const wanted = (MIN_BAND_BINS * sampleRate) / Math.max(f1 - f0, 1e-6);

  let n = MIN_FILTER_FFT;

  while (n < wanted && n < MAX_FILTER_FFT) {
    n *= 2;
  }

  return n;
}

// Zero every bin outside [f0, f1] and transform back, overlap-adding the
// result. Both halves of each conjugate pair are zeroed together, so what comes
// back is real and no imaginary residue has to be discarded.
//
// The inverse comes from the forward transform by conjugation —
// `ifft(X) = conj(fft(conj(X)))/N` — because `fft.js` only goes one way, and
// giving it an inverse it would otherwise never use is not worth the surface.
function bandpass(samples, sampleRate, f0, f1, n) {
  const fft = new FFT(n);
  const hop = n / OVERLAP;
  const w = hann(n);

  const out = new Float32Array(samples.length);
  const norm = new Float32Array(samples.length);

  const re = new Float32Array(n);
  const im = new Float32Array(n);

  // DC is never wanted: the viewport's floor is `F_MIN` at its lowest, and a
  // drifting offset is not something anybody zoomed in to hear.
  const lo = Math.max(1, Math.round((f0 * n) / sampleRate));
  const hi = Math.min(n / 2, Math.round((f1 * n) / sampleRate));

  // A band narrower than one bin survives as that one bin: silence would be the
  // wrong answer, and the caller is told the band it got was wider than asked.
  const keepLo = Math.min(lo, hi);
  const keepHi = Math.max(lo, hi);

  // Did the band get the resolution it asked for? Not "did it collapse to
  // nothing" — a hairline band collapses to *one bin*, which is still audible
  // and still much wider than what is on screen. The honest question is whether
  // the transform was long enough to put the bins we wanted inside it, and past
  // `MAX_FILTER_FFT` the answer becomes no.
  const resolved = ((f1 - f0) * n) / sampleRate >= MIN_BAND_BINS;

  // Start a whole window early so the first real sample is already covered by a
  // full set of overlapping frames.
  for (let pos = -n + hop; pos < samples.length; pos += hop) {
    for (let i = 0; i < n; i++) {
      const s = pos + i;
      re[i] = (s >= 0 && s < samples.length ? samples[s] : 0) * w[i];
      im[i] = 0;
    }

    fft.transform(re, im);

    for (let b = 0; b <= n / 2; b++) {
      if (b >= keepLo && b <= keepHi) {
        continue;
      }

      const j = (n - b) % n;

      re[b] = 0;
      im[b] = 0;
      re[j] = 0;
      im[j] = 0;
    }

    for (let i = 0; i < n; i++) {
      im[i] = -im[i];
    }

    fft.transform(re, im);

    for (let i = 0; i < n; i++) {
      const s = pos + i;

      if (s < 0 || s >= samples.length) {
        continue;
      }

      out[s] += (re[i] / n) * w[i];
      norm[s] += w[i] * w[i];
    }
  }

  for (let i = 0; i < out.length; i++) {
    if (norm[i] > 1e-6) {
      out[i] /= norm[i];
    }
  }

  return {samples: out, widenedBand: !resolved};
}

// The stretch of recording a viewport asks to hear, widened to something
// audible if it is very short, and clamped to the recording itself.
function clipRange(rec, view) {
  const n = rec.samples.length;
  const least = Math.min(n, Math.round((rec.sampleRate * MIN_PLAY_MS) / 1000));

  let t0 = view.t0;
  let t1 = view.t1;

  if (t1 - t0 < least) {
    const mid = (t0 + t1) / 2;
    t0 = mid - least / 2;
    t1 = mid + least / 2;
  }

  if (t0 < 0) {
    t1 -= t0;
    t0 = 0;
  }

  if (t1 > n) {
    t0 -= t1 - n;
    t1 = n;
  }

  return {t0: Math.max(0, Math.floor(t0)), t1: Math.min(n, Math.ceil(t1))};
}

// Build the audio for a viewport: the visible stretch of time, holding only the
// visible band of frequency.
export function clipFor(rec, view) {
  const {sampleRate} = rec;
  const {t0, t1} = clipRange(rec, view);
  const n = filterSize(sampleRate, view.f0, view.f1);

  // Filter with a window of context on each side, then throw the context away.
  // Without it the filter's own start-up transient lands inside the clip.
  const from = Math.max(0, t0 - n);
  const to = Math.min(rec.samples.length, t1 + n);

  const padded = rec.samples.subarray(from, to);
  const {samples: filtered, widenedBand} = bandpass(padded, sampleRate, view.f0, view.f1, n);

  const out = filtered.slice(t0 - from, t1 - from);
  const fade = Math.min(Math.round(sampleRate * EDGE_FADE_SEC), out.length >> 1);

  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }

  return {
    samples: out,
    sampleRate,
    t0,
    t1,
    f0: view.f0,
    f1: view.f1,
    widenedTime: t1 - t0 > Math.ceil(view.t1 - view.t0),
    widenedBand,
  };
}

export function isPlaying() {
  return !!current;
}

export function stop() {
  if (!current) {
    return;
  }

  const {node} = current;
  current = null;

  node.onended = null;
  node.stop();
  node.disconnect();
}

// Loops until stopped. A single pass of a 120 ms clip is not enough to judge
// anything by, and at these zooms the clip is often exactly that short.
export function play(ctx, rec, view) {
  stop();

  const clip = clipFor(rec, view);

  if (!clip.samples.length) {
    return null;
  }

  const buffer = ctx.createBuffer(1, clip.samples.length, clip.sampleRate);
  buffer.copyToChannel(clip.samples, 0);

  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.loop = true;
  node.connect(ctx.destination);
  node.start();

  current = {
    node,
    startedAt: ctx.currentTime,
    duration: buffer.duration,
    t0: clip.t0,
    t1: clip.t1,
    sampleRate: clip.sampleRate,
  };

  return clip;
}

// Where the playhead is now, in samples from the start of the recording, so the
// caller can place it against a viewport rather than against the clip.
export function playhead(ctx) {
  if (!current) {
    return null;
  }

  const elapsed = ctx.currentTime - current.startedAt;

  if (elapsed < 0) {
    return null;
  }

  return current.t0 + (elapsed % current.duration) * current.sampleRate;
}
