// Test signals whose right answer is known exactly.
//
// Each one is a formula, so the picture can be checked against the truth rather
// than against the last build: `partials(t)` is every frequency the signal
// contains at `t` seconds, and `clicks` the instants of its impulses. `make.mjs`
// renders them to `<name>.wav` beside this file, and the page reads this module
// to know what a loaded `signals/<name>.wav` ought to look like — see
// `probe.js`.
//
// Every signal carries the same faint white noise, about -66 dBFS. A real
// recording always has a floor, and the exposure is measured against it; pure
// digital silence would leave the calibration nothing to stand on.

export const SAMPLE_RATE = 48000;

const NOISE = 0.0005;
const TAU = 2 * Math.PI;

const sum = (fs, amp) => (t) =>
  fs.reduce((s, f) => s + Math.sin(TAU * f * t), 0) * amp;

const HARMONICS = Array.from({length: 12}, (_, k) => 180 * (k + 1));

const CLICK_TIMES = Array.from({length: 8}, (_, k) => 0.125 + 0.25 * k);

export const SIGNALS = {
  // Three steady tones, far apart: the simplest case there is.
  tones: {
    seconds: 2,
    wave: sum([440, 1000, 3000], 0.15),
    partials: () => [440, 1000, 3000],
  },

  // A harmonic stack at a low voice's pitch, amplitudes 1/k — a sawtooth, so
  // it also has a sharp edge once per period.
  harmonics: {
    seconds: 2,
    wave: (t) =>
      HARMONICS.reduce((s, f, k) => s + Math.sin(TAU * f * t) / (k + 1), 0) *
      0.1,
    partials: () => HARMONICS,
  },

  // Two tones 50 Hz apart, inside one main lobe of the base window: the case
  // reassignment draws as looping filaments, and the long window should part.
  close: {
    seconds: 2,
    wave: sum([1000, 1050], 0.15),
    partials: () => [1000, 1050],
  },

  // A linear sweep, 200 Hz to 4 kHz over two seconds: 1.9 kHz/s.
  chirp: {
    seconds: 2,
    wave: (t) => 0.25 * Math.sin(TAU * (200 * t + 950 * t * t)),
    partials: (t) => [200 + 1900 * t],
  },

  // 600 Hz with ±30 Hz of vibrato at 5 Hz: a ridge that keeps changing
  // direction, which is what the coherence and support gates have to follow.
  vibrato: {
    seconds: 2,
    wave: (t) =>
      0.25 *
      Math.sin(TAU * (600 * t - (30 / (TAU * 5)) * Math.cos(TAU * 5 * t))),
    partials: (t) => [600 + 30 * Math.sin(TAU * 5 * t)],
  },

  // Single-sample impulses four times a second: vertical lines, and nothing else.
  clicks: {
    seconds: 2,
    wave: (t) =>
      CLICK_TIMES.some((c) => Math.abs(t - c) < 0.5 / SAMPLE_RATE) ? 0.5 : 0,
    partials: () => [],
    clicks: CLICK_TIMES,
  },

  // White noise alone. There is no structure to find; whatever the picture
  // calls coherent here is the analysis talking.
  noise: {
    seconds: 2,
    wave: () => 0,
    partials: () => [],
    noise: 0.05,
  },
};

// The samples, deterministic: the noise comes from a fixed seed.
export function render(name) {
  const sig = SIGNALS[name];
  const n = Math.round(sig.seconds * SAMPLE_RATE);
  const out = new Float32Array(n);

  let seed = 12345;
  const noise = sig.noise ?? NOISE;

  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    out[i] = sig.wave(i / SAMPLE_RATE) + noise * (2 * (seed / 2147483647) - 1);
  }

  return out;
}
