import {makeSim} from './sim.js';
import {makeRenderer} from './render.js';
import {makeSeed} from './seed.js';
import {decodeRle, place} from './pattern.js';
import {species} from './species.js';
import {makeGallery} from './gallery.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

// Chan's creatures, each a rule plus the shape it starts from
const creatures = species.map(({name, cells, ...rule}) => ({
  rule: {species: name, ...rule},
  pattern: decodeRle(cells),
}));
const byName = Object.fromEntries(creatures.map((c) => [c.rule.species, c]));

const defaults = {
  ...byName['Triguttome labens'].rule,
  N: 128,
  speed: 2, // steps per frame
  threshold: 0.3,
};

// Settings live in the URL hash so a link brings back the same rule, started
// from the named creature's shape. (A searched creature's own shape is too
// big for a link, but its ancestor's usually grows into it.)
const readHash = () => {
  const params = new URLSearchParams(location.hash.slice(1));
  const s = {...defaults};
  for (const [key, value] of params) {
    if (key === 'peaks') s.peaks = value.split(',').map(Number);
    else if (key === 'species') s.species = value;
    else if (key in s) s[key] = Number(value);
  }
  return s;
};
const writeHash = () => {
  const {N, species, R, peaks, mu, sigma, dt} = settings;
  history.replaceState(
    null,
    '',
    '#' + new URLSearchParams({N, species, R, peaks, mu, sigma, dt}),
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

// Rules are written for a 64³ world. Bigger worlds show the same thing in
// more detail: the kernel and starting shape are scaled up to match.
const zoom = settings.N / 64;
let pattern = byName[settings.species]?.pattern;

const seed = () => {
  sim.setState(
    pattern
      ? place(pattern, settings.N, zoom)
      : makeSeed(settings.N, settings.R * zoom),
  );
  needsStep = true; // so the new state shows up even while paused
};
let needsStep = false;

const applyKernel = () => sim.setKernel(settings.R * zoom, settings.peaks);
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
  creature: byName[settings.species] ? settings.species : '',
  rings: settings.peaks.join(', '),
  paused: false,
  reseed: seed,
};

const loadRule = (rule, shape) => {
  Object.assign(settings, rule);
  pattern = shape;
  actions.rings = settings.peaks.join(', ');
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  applyKernel();
  applyParams();
  writeHash();
  seed();
};

const gui = new GUI({title: 'Lenia 3D'});
gui
  .add(actions, 'creature', ['', ...Object.keys(byName)])
  .name('creature')
  .onChange(
    (name) => name && loadRule(byName[name].rule, byName[name].pattern),
  );
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
  .name('detail')
  .onChange(() => {
    writeHash();
    location.reload();
  });
const pausedController = gui.add(actions, 'paused').name('paused');
gui.add(actions, 'reseed').name('reseed');

const gallery = makeGallery(device, creatures, (rule, shape) => {
  actions.creature = '';
  loadRule(rule, shape);
});
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
});

// ---- camera

const camera = {yaw: 0.6, pitch: 0.35, distance: 2};
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
