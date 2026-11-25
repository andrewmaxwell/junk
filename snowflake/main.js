import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {makeChart} from './chart.js';
import {BASE, paramsFor} from './habits.js';
import {makeRenderer} from './render.js';
import {makeSim} from './sim.js';

const $ = (id) => document.getElementById(id);
const say = (text) => ($('stats').textContent = text);

/** Paths through the chart: [temperature C, humidity 0-1] */
const PRESETS = {
  'Fern star': [[-15, 0.9]],
  'Sectored plate': [[-14, 0.45]],
  'Simple plate': [[-16, 0.15]],
  'Plate, then a star': [
    [-16, 0.2],
    [-15, 0.9],
  ],
  'Star, then plates': [
    [-15, 0.9],
    [-16, 0.2],
  ],
  'Hollow column': [[-5, 0.85]],
  Column: [[-7, 0.25]],
  'Capped column': [
    [-7, 0.3],
    [-15, 0.7],
  ],
};

const SIZES = {
  'Small (fast)': {n: 128, nz: 48},
  Medium: {n: 256, nz: 96},
  'Large (slow)': {n: 384, nz: 128},
};

const settings = {
  preset: 'Fern star',
  size: 'Medium',
  speed: 60,
  paused: false,
  exposure: 1.5,
  bounces: 3,
  ice: 1.31,
  resolution: 1,
  manual: false,
  restart: () => restart(),
};
const manual = {...BASE};

if (!navigator.gpu) {
  say('This needs WebGPU, which this browser does not have.');
  throw new Error('no WebGPU');
}
const adapter = await navigator.gpu.requestAdapter();
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  },
});
device.addEventListener('uncapturederror', (e) => say(e.error.message));

const canvas = /** @type {HTMLCanvasElement} */ ($('view'));
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({device, format, alphaMode: 'opaque'});
const renderer = makeRenderer(device, format);

let sim = null;
let progress = 0;
let done = false;

const chart = makeChart($('chart'), () => {
  settings.preset = '(drawn)';
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
  restart();
});

const conditions = () => chart.at(progress);
const params = () => (settings.manual ? manual : paramsFor(conditions()));

const restart = () => {
  const size = SIZES[settings.size];
  if (!sim || sim.n !== size.n || sim.nz !== size.nz) {
    sim?.destroy();
    sim = makeSim(device, size);
  }
  progress = 0;
  done = false;
  camera.fit = 8;
  renderer.restart();
  sim.reset(params().rho);
};

const usePreset = () => {
  const path = PRESETS[settings.preset];
  if (!path) return;
  chart.path = path.map(([T, s]) => ({T, s}));
  restart();
};

// ---- camera: orbits the crystal and zooms to keep it in view

const camera = {yaw: 0.6, pitch: 0.9, zoom: 1, fit: 8};
const basis = () => {
  const {yaw, pitch} = camera;
  const back = [
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.cos(yaw),
  ];
  const lens = 0.5; // image height at distance 1: a long macro lens
  // far enough back to fit the crystal across a narrow screen too
  const aspect = canvas.clientWidth / canvas.clientHeight || 1;
  const distance =
    ((2.3 * camera.fit) / lens) * camera.zoom * Math.max(1, 1.2 / aspect);
  const forward = back.map((b) => -b);
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  return {
    position: back.map((b) => b * distance),
    forward,
    right,
    up,
    zoom: lens,
    distance,
  };
};

const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
});
canvas.addEventListener('pointermove', (e) => {
  const last = pointers.get(e.pointerId);
  if (!last) return;
  const [x, y] = last;
  if (pointers.size === 1) {
    camera.yaw -= (e.clientX - x) * 0.006;
    camera.pitch = Math.max(
      -1.55,
      Math.min(1.55, camera.pitch + (e.clientY - y) * 0.006),
    );
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const before = Math.hypot(a[0] - b[0], a[1] - b[1]);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const [c, d] = [...pointers.values()];
    camera.zoom *= before / Math.max(1, Math.hypot(c[0] - d[0], c[1] - d[1]));
  }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
});
const lift = (e) => pointers.delete(e.pointerId);
canvas.addEventListener('pointerup', lift);
canvas.addEventListener('pointercancel', lift);
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camera.zoom *= Math.exp(e.deltaY * 0.001);
  },
  {passive: false},
);

// ---- settings

const gui = new GUI({title: 'Snowflake'});
gui
  .add(settings, 'preset', [...Object.keys(PRESETS), '(drawn)'])
  .name('Preset')
  .onChange(usePreset);
gui.add(settings, 'paused').name('Paused');
gui.add(settings, 'restart').name('Restart');
gui.add(settings, 'speed', 1, 200, 1).name('Max steps per frame');
gui.add(settings, 'size', Object.keys(SIZES)).name('Grid').onChange(restart);
const look = gui.addFolder('Look').close();
look.add(settings, 'exposure', 0.1, 8).name('Exposure');
look.add(settings, 'bounces', 0, 8, 1).name('Bounces inside');
look.add(settings, 'ice', 1, 2, 0.01).name('Refractive index');
look.add(settings, 'resolution', 0.25, 2, 0.05).name('Pixels per point');
const model = gui.addFolder('Model').close();
model.add(settings, 'manual').name('Ignore the chart');
for (const key of Object.keys(BASE)) model.add(manual, key).name(key);

// ---- loop

const resize = () => {
  const scale = Math.min(devicePixelRatio, settings.resolution);
  const w = Math.max(1, Math.round(canvas.clientWidth * scale));
  const h = Math.max(1, Math.round(canvas.clientHeight * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
};

let lastView = '';
const frame = (stepCount) => {
  resize();
  const encoder = device.createCommandEncoder();
  if (stepCount > 0) {
    sim.setParams(params());
    sim.step(encoder, stepCount);
  }
  // Turning the camera or changing the look starts the picture over; zooming
  // and growing don't (the renderer moves the old picture to match)
  const {yaw, pitch} = camera;
  const view = JSON.stringify([
    yaw,
    pitch,
    settings.ice,
    settings.bounces,
    settings.resolution,
  ]);
  if (view !== lastView) renderer.restart();
  lastView = view;
  renderer.render(
    encoder,
    context,
    canvas,
    sim,
    basis(),
    settings,
    stepCount > 0,
  );
  const read = sim.readExtents(encoder);
  device.queue.submit([encoder.finish()]);
  read();

  const {radius, height} = sim.extents;
  // The path is laid out along the crystal's growth: how far it has grown
  // out plus how far up, so the dot moves on whichever way it grows
  const out = radius / (0.92 * (sim.n - 1));
  const up = height / (0.92 * (sim.nz - 1));
  progress = Math.min(1, out + up);
  done = out >= 1 || up >= 1 || progress >= 1;
  // Back away quickly as it grows, so it never outgrows the screen
  const target = Math.max(1.05 * Math.hypot(radius, height) + 3, 8);
  camera.fit += (target - camera.fit) * (target > camera.fit ? 0.3 : 0.1);
};

let testing = false;
// Steps per frame, adjusted to keep about 30 frames a second
let stepRate = 10;
let lastTime = 0;
const loop = (time) => {
  const dt = time - lastTime;
  lastTime = time;
  if (dt > 40) stepRate = Math.max(1, stepRate * 0.8);
  else if (dt < 28) stepRate = Math.min(settings.speed, stepRate * 1.1 + 1);
  if (!testing) {
    frame(settings.paused || done ? 0 : Math.round(stepRate));
    chart.draw(progress);
    const {T, s} = conditions();
    const {radius, height, steps} = sim.extents;
    say(
      `${T.toFixed(1)}°C, humidity ${(s * 100).toFixed(0)}%  ·  ` +
        `${2 * radius} × ${2 * height + 1} cells  ·  step ${steps.toLocaleString()}` +
        (done ? '  ·  full grown' : ''),
    );
  }
  requestAnimationFrame(loop);
};

usePreset();
requestAnimationFrame(loop);

/** For tuning from a script: grows a crystal and draws it, then waits */
window.snow = {
  settings,
  manual,
  camera,
  chart,
  /** Times 300 steps and one preview frame at a few sizes as it grows */
  async perf(path) {
    testing = true;
    chart.path = path.map(([T, s]) => ({T, s}));
    restart();
    const rows = [];
    const time = async (fn) => {
      await device.queue.onSubmittedWorkDone();
      const t = performance.now();
      fn();
      await device.queue.onSubmittedWorkDone();
      return Math.round(performance.now() - t);
    };
    while (!done) {
      const stepMs = await time(() => frame(300));
      renderer.restart();
      const renderMs = await time(() => frame(0));
      rows.push([sim.extents.radius, stepMs, renderMs]);
    }
    testing = false;
    return rows.filter((_, k) => k % Math.ceil(rows.length / 8) === 0);
  },
  async grow({path, model: m, steps = 20000, chunk = 100} = {}) {
    testing = true;
    if (m) Object.assign(manual, m);
    settings.manual = !!m;
    if (path) chart.path = path.map(([T, s]) => ({T, s}));
    restart();
    for (let k = 0; k < steps && !done; k += chunk) {
      frame(chunk);
      await device.queue.onSubmittedWorkDone();
    }
    for (let k = 0; k < 80; k++) {
      frame(0);
      await device.queue.onSubmittedWorkDone();
    }
    chart.draw(progress);
    return {...sim.extents, progress};
  },
};
