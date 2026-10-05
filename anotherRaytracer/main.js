import {color, makeGradient, makeRenderer} from '../sand/makeRenderer.js';

const width = 512;
const height = 384;
const pixels = width * height;
// Leave some cores for everything else
const threads = Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));

// Adaptive sampling: every pixel gets at least minSamples, then each
// tileSize × tileSize tile keeps getting more only while its estimated noise is
// above noiseThreshold (in display brightness, 0 to 1), up to maxSamples.
const minSamples = 32;
const maxSamples = 2048;
const noiseThreshold = 0.02;
const tileSize = 8;

const canvas = document.querySelector('canvas');
const stats = document.querySelector('#stats');

const params = new URLSearchParams(location.search);
/** 'mis' (default), 'light' or 'bsdf'; see `sampling` in worker.js */
const sampling = params.get('sampling') ?? 'mis';
/** 'cornell' (default) or 'veach'; see `scenes` in worker.js */
const scene = params.get('scene') ?? 'cornell';
/** Cap on bounced light per sample; 0 for none. See `maxIndirect` in worker.js */
const clamp = Number(params.get('clamp') ?? 20);

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
const active = new Uint8Array(pixels);
let activeCount = pixels;

// Noise is judged per tile rather than per pixel: one pixel's noise estimate
// is itself noisy, so pixels whose first samples happened to agree would stop
// too early. Tiles stop as a unit, when the root-mean-square noise of their
// pixels is low enough, so a few noisy pixels keep the whole tile going.
const updateActive = () => {
  activeCount = 0;
  for (let ty = 0; ty < height; ty += tileSize) {
    for (let tx = 0; tx < width; tx += tileSize) {
      const yEnd = Math.min(height, ty + tileSize);
      const xEnd = Math.min(width, tx + tileSize);
      let sumSq = 0;
      let n = 0;
      for (let y = ty; y < yEnd; y++) {
        for (let x = tx; x < xEnd; x++) {
          sumSq += pixelNoise(y * width + x) ** 2;
          n++;
        }
      }
      const on = Math.sqrt(sumSq / n) > noiseThreshold;
      for (let y = ty; y < yEnd; y++) {
        for (let x = tx; x < xEnd; x++) {
          const p = y * width + x;
          active[p] = +(on && counts[p] < maxSamples);
          activeCount += active[p];
        }
      }
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
    w.postMessage({width, height, sampling, scene, clamp, active: mask});
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
  if (showHeatmap) {
    // Dark purple at minSamples up to pale yellow at maxSamples, on a log scale
    return heatmap(
      Math.log(n / minSamples) / Math.log(maxSamples / minSamples),
    );
  }
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
      `${threads} threads · ${scene} · sampling: ${sampling} · space: pause · h: samples per pixel (${minSamples} purple → ${maxSamples} yellow)`;
  }
  requestAnimationFrame(loop);
};
loop();
