import {makeSim} from './sim.js';
import {makeRenderer} from './render.js';
import {makeSeed} from './seed.js';
import {makeGallery} from './gallery.js';
import {decodeRule, encodeRule, mutate, randomRule} from './rule.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

const defaults = {
  N: 64,
  density: 0.08, // average matter per cell to start with
  dt: 0.2,
  speed: 3, // steps per frame
  threshold: 0.4,
};

// Settings and the rule live in the URL hash, so a link brings back the same
// world (from a different random start).
const readHash = () => {
  const params = new URLSearchParams(location.hash.slice(1));
  const s = {...defaults};
  for (const key of Object.keys(defaults)) {
    if (params.has(key)) s[key] = Number(params.get(key));
  }
  return {settings: s, rule: decodeRule(params.get('rule') ?? '')};
};
const writeHash = () => {
  const {N, density, dt} = settings;
  history.replaceState(
    null,
    '',
    '#' + new URLSearchParams({N, density, dt, rule: encodeRule(rule)}),
  );
};

const hash = readHash();
const settings = hash.settings;
let rule = hash.rule ?? randomRule();

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

let needsStep = false;
const seed = () => {
  sim.setState(makeSeed(settings.N, settings.density));
  needsStep = true; // so the new state shows up even while paused
};
const loadRule = (newRule) => {
  rule = newRule;
  sim.setRule(rule);
  writeHash();
  seed();
};
sim.setTimeStep(settings.dt);
loadRule(rule);

// ---- controls

const actions = {
  paused: false,
  reseed: seed,
  random: () => loadRule(randomRule()),
  nudge: () => loadRule(mutate(rule)),
};

const gui = new GUI({title: 'Lenia 3D'});
gui.add(actions, 'random').name('new random rule');
gui.add(actions, 'nudge').name('nudge this rule');
gui
  .add(settings, 'density', 0.02, 0.3, 0.005)
  .name('matter')
  .onFinishChange(() => {
    writeHash();
    seed();
  });
gui
  .add(settings, 'dt', 0.05, 0.5, 0.01)
  .name('time step')
  .onChange(() => {
    sim.setTimeStep(settings.dt);
    writeHash();
  });
gui.add(settings, 'speed', 0, 6, 1).name('steps per frame');
gui.add(settings, 'threshold', 0.05, 1.5, 0.01).name('surface');
gui
  .add(settings, 'N', {'64³': 64, '128³ (8 times the room)': 128})
  .name('world size')
  .onChange(() => {
    writeHash();
    location.reload();
  });
const pausedController = gui.add(actions, 'paused').name('paused');
gui.add(actions, 'reseed').name('reseed');

const gallery = makeGallery(device, () => settings.density, loadRule);
const search = {
  searching: false,
  gallery: gallery.hasFavorites,
  clear: gallery.clear,
};
gallery.element.hidden = !search.gallery;
const searchFolder = gui.addFolder('Search');
searchFolder
  .add(search, 'searching')
  .name('searching')
  .onChange((value) => {
    gallery.setRunning(value);
    if (value) galleryController.setValue(true);
  });
const galleryController = searchFolder
  .add(search, 'gallery')
  .name('show gallery')
  .onChange((value) => (gallery.element.hidden = !value));
searchFolder.add(search, 'clear').name('clear results');

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') pausedController.setValue(!actions.paused);
  if (e.key === 'r') seed();
  if (e.key === 'n') actions.random();
});

// ---- camera

const camera = {yaw: 0.6, pitch: 0.35, distance: 2.8};
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
// zoom all the way in to fly inside the world
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.distance = Math.max(
      0.05,
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
