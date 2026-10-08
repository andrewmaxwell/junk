import {makeSim} from './sim.js';
import {makeRenderer} from './render.js';
import {makeSeed} from './seed.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

// Found by a random search for rules that neither die out nor fill the world,
// then rerun at 128³ with different seeds. Bubbles and Pebbles always settled
// down; Pearls erupts and fills the world about one time in four.
const presets = {
  Bubbles: {R: 10, peaks: [0.59, 0.74, 0.4], mu: 0.084, sigma: 0.0165, dt: 0.1},
  Pebbles: {R: 10, peaks: [0.16, 0.11], mu: 0.2547, sigma: 0.0402, dt: 0.1},
  Pearls: {
    R: 10,
    peaks: [0.56, 0.23, 0.21],
    mu: 0.3303,
    sigma: 0.0767,
    dt: 0.1,
  },
  Foam: {R: 16, peaks: [1], mu: 0.15, sigma: 0.04, dt: 0.1},
};

const defaults = {
  ...presets.Bubbles,
  N: 128,
  speed: 2, // steps per frame
  threshold: 0.3,
};

// settings live in the URL hash so a link brings back the same rule
const readHash = () => {
  const params = new URLSearchParams(location.hash.slice(1));
  const s = {...defaults};
  for (const [key, value] of params) {
    if (key === 'peaks') s.peaks = value.split(',').map(Number);
    else if (key in s) s[key] = Number(value);
  }
  return s;
};
const writeHash = () => {
  const {N, R, peaks, mu, sigma, dt} = settings;
  history.replaceState(
    null,
    '',
    '#' + new URLSearchParams({N, R, peaks, mu, sigma, dt}),
  );
};

const settings = readHash();

if (!navigator.gpu) {
  document.body.textContent =
    'This needs WebGPU, which this browser does not support.';
  throw new Error('WebGPU is not available');
}
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  },
});

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({device, format});

const sim = makeSim(device, settings.N);
const render = makeRenderer(device, context, format, sim);

const seed = () => {
  sim.setState(makeSeed(settings.N, settings.R));
  needsStep = true; // so the new state shows up even while paused
};
let needsStep = false;

const applyKernel = () => sim.setKernel(settings.R, settings.peaks);
const applyParams = () => sim.setParams(settings);

applyKernel();
applyParams();
seed();

// ---- controls

const ruleChanged = () => {
  applyParams();
  writeHash();
};
const kernelChanged = () => {
  applyKernel();
  writeHash();
};

const actions = {
  preset: '',
  rings: settings.peaks.join(', '),
  paused: false,
  reseed: seed,
};

const gui = new GUI({title: 'Lenia 3D'});
gui
  .add(actions, 'preset', ['', ...Object.keys(presets)])
  .name('preset')
  .onChange((name) => {
    if (!name) return;
    Object.assign(settings, presets[name]);
    actions.rings = settings.peaks.join(', ');
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    applyKernel();
    applyParams();
    writeHash();
    seed();
  });
gui
  .add(settings, 'mu', 0.02, 0.5, 0.001)
  .name('growth μ')
  .onChange(ruleChanged);
gui
  .add(settings, 'sigma', 0.002, 0.12, 0.0005)
  .name('width σ')
  .onChange(ruleChanged);
gui.add(settings, 'R', 4, 30, 1).name('radius').onChange(kernelChanged);
gui
  .add(actions, 'rings')
  .name('rings')
  .onFinishChange((value) => {
    const peaks = value
      .split(',')
      .map(Number)
      .filter((v) => !isNaN(v));
    if (peaks.length) {
      settings.peaks = peaks;
      kernelChanged();
    }
    actions.rings = settings.peaks.join(', ');
  });
gui
  .add(settings, 'dt', 0.01, 0.3, 0.005)
  .name('time step')
  .onChange(ruleChanged);
gui.add(settings, 'speed', 0, 8, 1).name('steps per frame');
gui.add(settings, 'threshold', 0.05, 0.9, 0.01).name('surface');
gui
  .add(settings, 'N', {'64³': 64, '128³': 128, '256³ (slow)': 256})
  .name('world size')
  .onChange(() => {
    writeHash();
    location.reload();
  });
const pausedController = gui.add(actions, 'paused').name('paused');
gui.add(actions, 'reseed').name('reseed');

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') pausedController.setValue(!actions.paused);
  if (e.key === 'r') seed();
});

// ---- camera

const camera = {yaw: 0.6, pitch: 0.35, distance: 3};
let lastInteraction = -Infinity;
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, e);
});
canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (!last) return;
  pointers.set(e.pointerId, e);
  if (pointers.size > 1) return;
  camera.yaw -= (e.clientX - last.clientX) * 0.006;
  camera.pitch = Math.max(
    -1.5,
    Math.min(1.5, camera.pitch + (e.clientY - last.clientY) * 0.006),
  );
  lastInteraction = performance.now();
});
const release = (e) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.distance = Math.max(
      1.2,
      Math.min(8, camera.distance * Math.exp(e.deltaY * 0.001)),
    );
  },
  {passive: false},
);

const resize = () => {
  const ratio = Math.min(devicePixelRatio, 1.5);
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
};
addEventListener('resize', resize);
resize();

// ---- loop

let lastTime = performance.now();
const loop = (time) => {
  const dt = Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  // drift slowly around once you let go
  if (time - lastInteraction > 3000) camera.yaw += dt * 0.08;

  const encoder = device.createCommandEncoder();
  const steps = actions.paused ? 0 : settings.speed;
  sim.step(encoder, needsStep ? Math.max(1, steps) : steps);
  needsStep = false;
  render(encoder, {...camera, threshold: settings.threshold, time});
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
