import {color, makeGradient, makeRenderer} from '../sand/makeRenderer.js';

const width = 512;
const height = 384;
const pixels = width * height;
// Leave some cores for everything else
const threads = Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));

// Adaptive sampling: every pixel gets at least minSamples, then keeps getting
// more only while its estimated noise is above noiseThreshold (in display
// brightness, 0 to 1), up to maxSamples.
const minSamples = 32;
const maxSamples = 2048;
const noiseThreshold = 0.025;

const canvas = document.querySelector('canvas');
const stats = document.querySelector('#stats');

/** 'mis' (default), 'light' or 'bsdf'; see `sampling` in worker.js */
const sampling = new URLSearchParams(location.search).get('sampling') ?? 'mis';

// Per pixel: summed color, summed brightness and brightness squared (for
// estimating noise), and sample count
const sums = new Float64Array(pixels * 3);
const lumSums = new Float64Array(pixels);
const lumSqSums = new Float64Array(pixels);
const counts = new Uint32Array(pixels);
let totalSamples = 0;

/** @type {(x: number) => number} */
const gamma = (x) => Math.min(1, x) ** (1 / 2.2);

/** Estimated noise of pixel p's displayed brightness.
 * @type {(p: number) => number} */
const pixelNoise = (p) => {
  const n = counts[p];
  if (n < minSamples) return Infinity;
  const mean = lumSums[p] / n;
  const variance = Math.max(0, lumSqSums[p] / n - mean * mean);
  // Standard error: how far the average of n samples is likely to be off
  const stdErr = Math.sqrt(variance / n);
  // Convert to display brightness, where dark values are stretched by gamma
  return gamma(mean + stdErr) - gamma(Math.max(0, mean - stdErr));
};

// Which pixels still need samples
const needsWork = new Uint8Array(pixels);
const active = new Uint8Array(pixels);
let activeCount = pixels;

const updateActive = () => {
  for (let p = 0; p < pixels; p++) {
    needsWork[p] = +(counts[p] < maxSamples && pixelNoise(p) > noiseThreshold);
  }
  // Also sample the neighbors of noisy pixels, so a pixel whose first samples
  // happened to agree doesn't stop early next to one that's clearly noisy.
  activeCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      let on = 0;
      for (
        let ny = Math.max(0, y - 1);
        ny <= Math.min(height - 1, y + 1);
        ny++
      ) {
        for (
          let nx = Math.max(0, x - 1);
          nx <= Math.min(width - 1, x + 1);
          nx++
        ) {
          on |= needsWork[ny * width + nx];
        }
      }
      active[p] = on & +(counts[p] < maxSamples);
      activeCount += active[p];
    }
  }
};

let paused = false;
let showHeatmap = false;
let renderMs = 0;
let lastResume = performance.now();
let clockRunning = true;
let dirty = true;

const isRunning = () => !paused && !document.hidden && activeCount > 0;

/** Which pixels each busy worker was asked to render
 * @type {Map<Worker, Uint8Array>} */
const pending = new Map();
/** @type {Worker[]} */
const idle = [];

/** @type {(w: Worker) => void} */
const requestFrame = (w) => {
  if (isRunning()) {
    const mask = active.slice();
    pending.set(w, mask);
    w.postMessage({width, height, sampling, active: mask});
  } else {
    idle.push(w);
  }
};

// Call after anything that might start or stop rendering, so the timer
// ignores time spent paused or hidden
const updateClock = () => {
  const now = performance.now();
  if (clockRunning) renderMs += now - lastResume;
  lastResume = now;
  clockRunning = isRunning();
};

const resume = () => {
  updateClock();
  idle.splice(0).forEach(requestFrame);
  dirty = true;
};

/** @type {(e: MessageEvent<Float32Array>) => void} */
const receiveMessage = ({data, target}) => {
  const w = /** @type {Worker} */ (target);
  const mask = pending.get(w);
  pending.delete(w);
  for (let p = 0; p < pixels; p++) {
    if (!mask[p]) continue;
    const r = data[p * 3];
    const g = data[p * 3 + 1];
    const b = data[p * 3 + 2];
    sums[p * 3] += r;
    sums[p * 3 + 1] += g;
    sums[p * 3 + 2] += b;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSums[p] += lum;
    lumSqSums[p] += lum * lum;
    counts[p]++;
    totalSamples++;
  }
  updateActive();
  updateClock();
  dirty = true;
  requestFrame(w);
};

const heatmap = makeGradient([
  [0, 0, 40],
  [120, 0, 160],
  [255, 90, 0],
  [255, 255, 180],
]);

/** @type {(x: number) => number} */
const toByte = (x) => gamma(x) * 255;
const render = makeRenderer(canvas, width, height, (_, vals, p) => {
  const n = counts[p];
  if (showHeatmap) return heatmap(Math.log2(n || 1) / Math.log2(maxSamples));
  if (!n) return color(0, 0, 0);
  return color(
    toByte(vals[p * 3] / n),
    toByte(vals[p * 3 + 1] / n),
    toByte(vals[p * 3 + 2] / n),
  );
});

for (let i = 0; i < threads; i++) {
  const w = new Worker('worker.js', {type: 'module'});
  w.onmessage = receiveMessage;
  requestFrame(w);
}

document.addEventListener('visibilitychange', resume);
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    paused = !paused;
    resume();
  } else if (e.key === 'h') {
    showHeatmap = !showHeatmap;
    dirty = true;
  }
});

const loop = () => {
  if (dirty) {
    dirty = false;
    render(sums);
    const secs =
      (renderMs + (clockRunning ? performance.now() - lastResume : 0)) / 1000;
    const done = ((1 - activeCount / pixels) * 100).toFixed(0);
    const status = !activeCount
      ? 'done'
      : paused
        ? 'paused'
        : `${done}% converged`;
    stats.textContent =
      `${status} · ${(totalSamples / pixels).toFixed(0)} avg spp · ${secs.toFixed(0)}s · ` +
      `${threads} threads · sampling: ${sampling} · space: pause · h: sample heatmap`;
  }
  requestAnimationFrame(loop);
};
loop();
