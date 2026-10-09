import {makeSim} from './sim.js';
import {cameraFrame, makeRenderer, rayThrough} from './render.js';
import {makeGenomes, makeSeed} from './seed.js';
import {makeGallery} from './gallery.js';
import {decodeRule, encodeRule, mutate, randomRule} from './rule.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';

const defaults = {
  N: 64,
  scale: 1, // 2 draws everything twice as large, for finer detail
  density: 0.08, // average matter per cell to start with
  lineages: 1, // regions starting with different genomes
  mutations: 0, // new lineages per 1000 steps
  food: 1, // how hard matter is drawn to food
  regrow: 0.01, // how fast eaten food grows back
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
  const {N, scale, density, lineages, mutations, food, regrow, dt} = settings;
  history.replaceState(
    null,
    '',
    '#' +
      new URLSearchParams({
        N,
        scale,
        density,
        lineages,
        mutations,
        food,
        regrow,
        dt,
        rule: encodeRule(rule),
      }),
  );
};

const hash = readHash();
const settings = hash.settings;
if (settings.N > 64) settings.speed = 1; // big worlds are slow enough already
let rule = hash.rule ?? randomRule(3);

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
// The GPU can drop the device (a driver reset, or work running too long).
// Nothing can be recovered from that but a reload.
device.lost.then(({message}) => {
  console.error('WebGPU device lost:', message);
  document.querySelector('#hint').textContent =
    'The GPU stopped responding. Reload the page to start again.';
});

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({device, format});

const sim = makeSim(device, settings.N);
const render = makeRenderer(device, context, format, sim);

let needsStep = false;
// Rules are written for a 64³ world. In a finer world (scale 2) everything
// is drawn twice as large: kernels, starting lumps, and how far matter moves
// each step. Matter still spreads by the same fraction of a cell each step,
// so relative to the bodies it blurs half as much, and they come out with
// finer detail: pores, dimples, sharper edges.
const {scale} = settings;
const colorMode = () => {
  if (settings.lineages > 1 || settings.mutations > 0) return 2;
  return rule.channels > 1 ? 1 : 0;
};
const seed = () => {
  sim.setState(
    makeSeed(settings.N, settings.density, rule.channels, 2 * scale),
  );
  sim.setEvolving(colorMode() === 2);
  sim.setGenomes(makeGenomes(settings.N, rule, settings.lineages));
  sim.resetFood();
  sim.setColorMode(colorMode());
  needsStep = true; // so the new state shows up even while paused
};
const loadRule = (newRule) => {
  rule = newRule;
  sim.setRule({...rule, R: rule.R * scale});
  writeHash();
  seed();
};
sim.setTimeStep(settings.dt * scale);
const food = () => ({pull: settings.food, eat: 0.5, regrow: settings.regrow});
const setFood = () => sim.setFood(food());
setFood();
loadRule(rule);

// ---- controls

const actions = {
  kinds: rule.channels,
  drag: 'orbit',
  paused: false,
  reseed: seed,
  random: () => loadRule(randomRule(actions.kinds)),
  nudge: () => loadRule(mutate(rule)),
};

const gui = new GUI({title: 'Lenia 3D'});
gui
  .add(actions, 'kinds', {one: 1, two: 2, three: 3})
  .name('kinds of matter')
  .onChange(actions.random);
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
  .add(settings, 'lineages', 1, 8, 1)
  .name('lineages')
  .onFinishChange(() => {
    writeHash();
    seed();
  });
gui
  .add(settings, 'mutations', 0, 10, 0.5)
  .name('mutations')
  .onChange(() => {
    writeHash();
    sim.setColorMode(colorMode());
    sim.setEvolving(colorMode() === 2);
  });
gui
  .add(settings, 'food', 0, 5, 0.1)
  .name('hunger')
  .onChange(() => {
    setFood();
    writeHash();
  });
gui
  .add(settings, 'regrow', 0, 0.05, 0.001)
  .name('food regrows')
  .onChange(() => {
    setFood();
    writeHash();
  });
gui
  .add(settings, 'dt', 0.05, 0.5, 0.01)
  .name('time step')
  .onChange(() => {
    sim.setTimeStep(settings.dt * scale);
    writeHash();
  });
gui.add(settings, 'speed', 0, 6, 1).name('steps per frame');
gui.add(settings, 'threshold', 0.05, 1.5, 0.01).name('surface');
const worlds = {
  '64³': '64 1',
  '128³, finer (slow)': '128 2',
  '128³, bigger (slow)': '128 1',
};
actions.world = `${settings.N} ${settings.scale}`;
gui
  .add(actions, 'world', worlds)
  .name('world')
  .onChange((value) => {
    [settings.N, settings.scale] = value.split(' ').map(Number);
    writeHash();
    location.reload();
  });
gui.add(actions, 'drag', ['orbit', 'stir']).name('drag to (shift: the other)');
const pausedController = gui.add(actions, 'paused').name('paused');
gui.add(actions, 'reseed').name('reseed');

const gallery = makeGallery(
  device,
  () => ({density: settings.density, food: food(), channels: actions.kinds}),
  (picked) => {
    actions.kinds = picked.channels;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    loadRule(picked);
  },
);
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
// stirring: the ray under the pointer, and how hard to push along it (which
// fades out after you stop moving)
const stir = {at: [0, 0], push: [0, 0, 0]};
const toScreen = (e) => [
  (e.clientX / canvas.clientWidth) * 2 - 1,
  1 - (e.clientY / canvas.clientHeight) * 2,
];
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, e);
});
canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (!last) return;
  pointers.set(e.pointerId, e);
  if (pointers.size > 1) return;
  if ((actions.drag === 'stir') !== e.shiftKey) {
    // push along the drag, as seen from the camera
    const {right, up} = cameraFrame(camera);
    const [x0, y0] = toScreen(last);
    const [x, y] = (stir.at = toScreen(e));
    const aspect = canvas.clientWidth / canvas.clientHeight;
    const gain = 40 * camera.distance;
    stir.push = stir.push.map(
      (v, i) => v + ((x - x0) * aspect * right[i] + (y - y0) * up[i]) * gain,
    );
    return;
  }
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
  if (Math.random() < (steps * settings.mutations) / 1000) sim.mutate(5);
  const frame = cameraFrame(camera);
  const aspect = canvas.clientWidth / canvas.clientHeight;
  sim.setStir(frame.eye, rayThrough(frame, stir.at, aspect), stir.push);
  stir.push = stir.push.map((v) => v * 0.8);
  sim.step(encoder, needsStep ? Math.max(1, steps) : steps);
  needsStep = false;
  render(encoder, {
    ...camera,
    threshold: settings.threshold,
    colorMode: colorMode(),
  });
  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
