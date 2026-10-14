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

// The demo: what the page opens with. Not a test so much as something worth
// looking at, built from what the picture is good at — a voice-like harmonic
// series with a melodic contour and vibrato, sung as two vowels whose formants
// light different harmonics; two bird-like trills of fast falling whistles;
// and two clicks. Its partials are known exactly all the same.

// Pitch: a slow rise and fall between 110 and 190 Hz, with 5.5 Hz vibrato.
const f0 = (t) =>
  150 + 40 * Math.sin(TAU * 0.2 * t) + 3 * Math.sin(TAU * 5.5 * t);
const phase0 = (t) =>
  150 * t -
  (40 / (TAU * 0.2)) * Math.cos(TAU * 0.2 * t) -
  (3 / (TAU * 5.5)) * Math.cos(TAU * 5.5 * t);

// Two vowels, each a span of time and its formants: [centre Hz, width Hz, gain].
const VOWELS = [
  {
    from: 0.15,
    to: 1.75,
    formants: [
      [700, 130, 1],
      [1200, 160, 0.6],
      [2600, 260, 0.25],
      [3500, 300, 0.12],
    ],
  },
  {
    from: 2.05,
    to: 3.75,
    formants: [
      [300, 90, 1],
      [2300, 220, 0.5],
      [3000, 280, 0.3],
      [3700, 300, 0.12],
    ],
  },
];

const HARMONIC_MAX = 8000;

// Raised-cosine edges, so a vowel starts and stops without a click.
function gate(t, from, to, edge = 0.06) {
  if (t <= from || t >= to) return 0;
  const a = Math.min(1, (t - from) / edge, (to - t) / edge);
  return 0.5 - 0.5 * Math.cos(Math.PI * a);
}

function voiced(t) {
  const v = VOWELS.find((w) => t > w.from && t < w.to);
  return v ? {v, g: gate(t, v.from, v.to)} : null;
}

// Falling whistles, 7 kHz to 3.5 kHz in 60 ms, exponentially.
const CHIRP_LEN = 0.06;
const CHIRP_F0 = 7000;
const CHIRP_F1 = 3500;
const CHIRP_AT = [0.45, 0.58, 0.71, 2.55, 2.68];
const CHIRP_K = Math.log(CHIRP_F1 / CHIRP_F0);

const chirpAt = (t) => CHIRP_AT.find((c) => t >= c && t < c + CHIRP_LEN);
const chirpF = (tau) => CHIRP_F0 * Math.exp((CHIRP_K * tau) / CHIRP_LEN);

const DEMO_CLICKS = [1.9, 3.9];

export const SIGNALS = {
  demo: {
    seconds: 4,
    wave: (t) => {
      let out = 0;

      const on = voiced(t);

      if (on) {
        const f = f0(t);
        const ph = TAU * phase0(t);

        for (let k = 1; k * f < HARMONIC_MAX; k++) {
          const fk = k * f;
          const env = on.v.formants.reduce(
            (s, [c, w, g]) => s + g * Math.exp(-(((fk - c) / w) ** 2)),
            0.03,
          );
          out += (env / Math.sqrt(k)) * Math.sin(k * ph);
        }

        out *= 0.16 * on.g;
      }

      const c = chirpAt(t);

      if (c !== undefined) {
        const tau = t - c;
        const ph =
          (TAU *
            CHIRP_F0 *
            CHIRP_LEN *
            (Math.exp((CHIRP_K * tau) / CHIRP_LEN) - 1)) /
          CHIRP_K;
        out += 0.15 * Math.sin(Math.PI * (tau / CHIRP_LEN)) ** 2 * Math.sin(ph);
      }

      if (DEMO_CLICKS.some((k) => Math.abs(t - k) < 0.5 / SAMPLE_RATE)) {
        out += 0.6;
      }

      return out;
    },
    partials: (t) => {
      const out = [];
      if (voiced(t)) {
        const f = f0(t);
        for (let k = 1; k * f < HARMONIC_MAX; k++) out.push(k * f);
      }
      const c = chirpAt(t);
      if (c !== undefined) out.push(chirpF(t - c));
      return out;
    },
  },

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
