import {FFT} from './fft.js';
import {buildLut} from './glview.js';

// A plain spectrogram drawn while a take is still being recorded, so there is
// something to watch. It is a preview and says so by looking simpler: a
// magnitude STFT, no reassignment, on the same log-frequency axis and colour
// ramp as the real picture, which replaces it as soon as the analysis of the
// finished take lands. Cheap enough for the main thread: one 2048-point
// transform per 512 samples, about 94 a second.

const N = 2048;
const HOP = 512;
const ROWS = 512;

// The take fills the screen from the left, at least this many seconds across,
// and is squeezed to fit once it is longer.
const MIN_SECONDS = 4;

// Brightness relative to the loudest thing seen so far in this take: the top
// of the ramp is the peak, the bottom this many dB below it.
const RANGE_DB = 60;

const lut = buildLut();

const hann = Float32Array.from(
  {length: N},
  (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N),
);

export function createLive(canvas, {read, position, fMin}) {
  const fft = new FFT(N);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const frame = new Float32Array(N);
  const power = new Float32Array(N / 2);

  let columns = null; // offscreen, one column per frame
  let column = null;
  let rowBins = null; // the range of bins each row draws from
  let sampleRate = 0;
  let next = 0; // where the next frame starts
  let count = 0; // frames so far
  let peak = -Infinity;
  let running = false;

  function start(takeFrom, rate, maxSeconds) {
    sampleRate = rate;
    next = takeFrom;
    count = 0;
    peak = -Infinity;
    running = true;

    const width = Math.ceil((maxSeconds * rate) / HOP) + 1;

    if (!columns || columns.width < width) {
      columns = new OffscreenCanvas(width, ROWS);
    }

    columns.getContext('2d').clearRect(0, 0, columns.width, ROWS);
    column = new ImageData(1, ROWS);

    // Row 0 is the top of the screen: Nyquist. A row that spans several bins
    // takes the strongest of them, so a partial stays one bright line at the
    // top of the axis; a row narrower than a bin, at the bottom, reads between
    // the two bins either side of it, so the low end is not drawn in blocks.
    const l0 = Math.log(fMin);
    const l1 = Math.log(rate / 2);
    rowBins = new Float32Array(ROWS * 2);

    for (let r = 0; r < ROWS; r++) {
      const hi = (Math.exp(l1 - (r / ROWS) * (l1 - l0)) * N) / rate;
      const lo = (Math.exp(l1 - ((r + 1) / ROWS) * (l1 - l0)) * N) / rate;
      rowBins[2 * r] = Math.max(1, lo);
      rowBins[2 * r + 1] = Math.min(N / 2 - 2, hi);
    }

    canvas.classList.add('show');
    paint();
  }

  // Transform whatever new audio has arrived, then draw.
  function update() {
    if (!running) {
      return;
    }

    let added = false;

    while (next + N <= position()) {
      read(next, frame);

      for (let n = 0; n < N; n++) {
        re[n] = frame[n] * hann[n];
        im[n] = 0;
      }

      fft.transform(re, im);

      for (let b = 0; b < N / 2; b++) {
        power[b] = re[b] * re[b] + im[b] * im[b];
      }

      const data = column.data;

      for (let r = 0; r < ROWS; r++) {
        const lo = rowBins[2 * r];
        const hi = rowBins[2 * r + 1];

        let p = 0;

        if (hi - lo < 1) {
          const at = (lo + hi) / 2;
          const b = Math.floor(at);
          p = power[b] + (power[b + 1] - power[b]) * (at - b);
        } else {
          for (let b = Math.round(lo); b <= Math.round(hi); b++) {
            p = Math.max(p, power[b]);
          }
        }

        const db = 10 * Math.log10(p + 1e-20);
        peak = Math.max(peak, db);

        const x = Math.min(1, Math.max(0, (db - peak + RANGE_DB) / RANGE_DB));
        const i = Math.round(x * 255) * 4;

        data[r * 4] = lut[i];
        data[r * 4 + 1] = lut[i + 1];
        data[r * 4 + 2] = lut[i + 2];
        data[r * 4 + 3] = 255;
      }

      columns.getContext('2d').putImageData(column, count, 0);

      count++;
      next += HOP;
      added = true;
    }

    if (added) {
      paint();
    }
  }

  // The seconds the picture spans across, for the axes.
  const span = () => Math.max(MIN_SECONDS, (count * HOP) / sampleRate);

  function paint() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (count) {
      const across = (w * (count * HOP)) / sampleRate / span();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(columns, 0, 0, count, ROWS, 0, 0, across, h);
    }
  }

  return {
    start,
    update,

    // Stop taking audio, but leave the picture up until the real one lands.
    stop() {
      running = false;
    },

    hide() {
      running = false;
      canvas.classList.remove('show');
    },

    visible: () => canvas.classList.contains('show'),

    // What is on screen, in the axes' terms: seconds since the take began.
    view: () => ({t0: 0, t1: span(), f0: fMin, f1: sampleRate / 2}),
  };
}
