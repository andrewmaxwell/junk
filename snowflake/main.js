import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {makeChart} from './chart.js';
import {BASE, SIGMA_MAX, T_MIN, paramsFor, sigmaFor} from './habits.js';
import {makeRenderer} from './render.js';
import {makeSim} from './sim.js';

const $ = (id) => document.getElementById(id);
const say = (text) => ($('stats').textContent = text);

/** Paths through the chart: [temperature C, supersaturation over ice %] */
const PRESETS = {
  'Fern star': [[-15, 16]],
  'Sectored plate': [[-14, 7.4]],
  'Simple plate': [[-16, 2.8]],
  'Plate, then a star': [
    [-16, 3.8],
    [-15, 16],
  ],
  'Hollow column': [[-5, 4.8]],
  Column: [[-7, 2]],
  'Capped column': [
    [-7, 2.4],
    [-15, 12.4],
  ],
};
const DRAWN = '(your own)';

const SIZES = {
  'Small (fast)': {n: 112, nz: 42},
  Medium: {n: 160, nz: 60},
  'Large (slow)': {n: 256, nz: 96},
};
/** About how many seconds a crystal takes to grow, if the GPU keeps up */
const SPEEDS = {Slow: 15, Normal: 5, Fast: 0};
/** How the crystal is lit, as in photos of real ones */
const LIGHTS = {
  'Dark field': 0,
  'Color backlight': 1,
  'Mitten, outdoors': 2,
  'Rainbow ring': 4,
  'Lamp and shadow': 5,
};
const lightKey = (light) => light.split(/[ ,]/).at(-1);

const settings = {
  preset: 'Fern star',
  size: 'Medium',
  speed: 'Normal',
  paused: false,
  light: 'Dark field',
  exposure: 1.5,
  bounces: 32,
  blur: 0.1,
  focus: 0,
  resolution: 1,
  manual: false,
  restart: () => restart(),
  random: () => randomWeather(),
};
const manual = {...BASE};

const fail = (text) => {
  say(text);
  $('stats').classList.add('error');
  throw new Error(text);
};
if (!navigator.gpu)
  fail(
    'This needs WebGPU, which this browser does not have. Try a recent Chrome, Edge or Safari.',
  );
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) fail('WebGPU is here, but no GPU adapter was available.');
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
/** Seconds the crystal has been growing, not counting pauses */
let growingFor = 0;
let done = false;

const chart = makeChart($('chart'), (path) => {
  chart.path = tidy(path);
  settings.preset = DRAWN;
  restart();
});

const conditions = () => chart.at(progress);
const params = () => (settings.manual ? manual : paramsFor(conditions()));

// ---- the weather path, in the URL so a link grows the same crystal

const toPath = (points) =>
  points.map(([T, percent]) => ({T, sigma: percent / 100}));
/**
 * A path rounded the way the URL writes it, with points closer than 3% of
 * the chart dropped, so the link grows exactly what was grown
 */
const tidy = (path) => {
  const round = ({T, sigma}) => ({
    T: Math.round(T * 10) / 10,
    sigma: Math.round(sigma * 1000) / 1000,
  });
  const kept = [round(path[0])];
  for (const p of path.slice(1)) {
    const last = kept.at(-1);
    if (
      Math.hypot((p.T - last.T) / T_MIN, (p.sigma - last.sigma) / SIGMA_MAX) >
      0.03
    )
      kept.push(round(p));
  }
  if (path.length > 1 && kept.length === 1) kept.push(round(path.at(-1)));
  return kept;
};
/** 'Small (fast)' is small in the URL */
const gridKey = (size) => size.split(' ')[0].toLowerCase();
const save = () => {
  const w = chart.path
    .map(({T, sigma}) => `${T.toFixed(1)},${(sigma * 100).toFixed(1)}`)
    .join(';');
  const grid =
    settings.size === 'Medium' ? '' : `&grid=${gridKey(settings.size)}`;
  const light =
    settings.light === 'Dark field' ? '' : `&light=${lightKey(settings.light)}`;
  history.replaceState(null, '', `#w=${w}${grid}${light}`);
};
const load = () => {
  const hash = new URLSearchParams(location.hash.slice(1));
  const size = Object.keys(SIZES).find((s) => gridKey(s) === hash.get('grid'));
  if (size) settings.size = size;
  const light = Object.keys(LIGHTS).find(
    (l) => lightKey(l) === hash.get('light'),
  );
  if (light) settings.light = light;
  const points = (hash.get('w') ?? '')
    .split(';')
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (!points.length) return;
  chart.path = toPath(points).map(({T, sigma}) => ({
    T: Math.min(0, Math.max(T_MIN, T)),
    sigma: Math.min(SIGMA_MAX, Math.max(0, sigma)),
  }));
  const same = (path) =>
    path.length === points.length &&
    path.every(([T, s], k) => T === points[k][0] && s === points[k][1]);
  settings.preset =
    Object.keys(PRESETS).find((name) => same(PRESETS[name])) ?? DRAWN;
};

/**
 * A random path a crystal might fall through: a few waypoints wandering in
 * temperature, mostly between ice and water saturation, joined smoothly
 */
const randomWeather = () => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const stops = [];
  let T = rand(-22, -3);
  for (let k = 2 + Math.floor(Math.random() * 3); k > 0; k--) {
    stops.push({T, wet: Math.sqrt(Math.random())});
    T = Math.min(-1, Math.max(-28, T + rand(-9, 9)));
  }
  // Catmull-Rom through the stops
  const path = [];
  const at = (k) => stops[Math.min(stops.length - 1, Math.max(0, k))];
  for (let k = 0; k < stops.length - 1; k++)
    for (let t = 0; t < 1; t += 1 / 16) {
      const [a, b, c, d] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
      const mix = (key) =>
        0.5 *
        (2 * b[key] +
          (c[key] - a[key]) * t +
          (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t +
          (3 * b[key] - a[key] - 3 * c[key] + d[key]) * t * t * t);
      const T = Math.min(-0.5, Math.max(T_MIN, mix('T')));
      path.push({T, sigma: sigmaFor(T, Math.min(1, Math.max(0, mix('wet'))))});
    }
  const last = stops.at(-1);
  path.push({T: last.T, sigma: sigmaFor(last.T, last.wet)});
  chart.path = tidy(path);
  settings.preset = DRAWN;
  restart();
};

const restart = () => {
  const size = SIZES[settings.size];
  if (!sim || sim.n !== size.n || sim.nz !== size.nz) {
    sim?.destroy();
    sim = makeSim(device, size);
  }
  progress = 0;
  growingFor = 0;
  done = false;
  camera.fit = 8;
  renderer.restart();
  sim.reset(params().rho);
  save();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
};

const usePreset = () => {
  const path = PRESETS[settings.preset];
  if (!path) return;
  chart.path = toPath(path);
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
  .add(settings, 'preset', [...Object.keys(PRESETS), DRAWN])
  .name('Weather')
  .onChange(usePreset);
const randomButton = gui.add(settings, 'random').name('Random weather');
gui.add(settings, 'paused').name('Paused');
gui.add(settings, 'restart').name('Restart');
gui.add(settings, 'speed', Object.keys(SPEEDS)).name('Speed');
gui.add(settings, 'size', Object.keys(SIZES)).name('Grid').onChange(restart);
gui.add(settings, 'light', Object.keys(LIGHTS)).name('Lighting').onChange(save);
const look = gui.addFolder('Look').close();
look.add(settings, 'exposure', 0.1, 8).name('Exposure');
look.add(settings, 'blur', 0, 3).name('Focus blur');
look.add(settings, 'focus', -1, 1).name('Focus nearer/farther');
look.add(settings, 'bounces', 1, 64, 1).name('Light bounces');
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
  if (stepCount > 0) sim.smoothField(encoder);
  // Turning the camera or changing the look starts the picture over; zooming
  // and growing don't (the renderer moves the old picture to match)
  const {yaw, pitch} = camera;
  const view = JSON.stringify([
    yaw,
    pitch,
    settings.bounces,
    settings.resolution,
    settings.light,
    settings.blur,
    settings.focus,
  ]);
  if (view !== lastView) renderer.restart();
  lastView = view;
  renderer.render(
    encoder,
    context,
    canvas,
    sim,
    basis(),
    {
      ...settings,
      light: settings.furnace ? 3 : LIGHTS[settings.light],
      // in units of the crystal's size, which the camera keeps in view
      aperture: settings.blur * 0.1 * camera.fit,
      focus: settings.focus * camera.fit,
    },
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
// Steps per frame: as many as keep about 30 frames a second, fewer when the
// crystal is ahead of the time its speed gives it
let stepRate = 10;
let lastTime = 0;
const loop = (time) => {
  const dt = time - lastTime;
  lastTime = time;
  if (!settings.paused && !done) growingFor += Math.min(dt, 100) / 1000;
  const ahead = progress > growingFor / SPEEDS[settings.speed];
  if (dt > 40 || ahead) stepRate = Math.max(1, stepRate * 0.8);
  else if (dt < 28) stepRate = Math.min(200, stepRate * 1.1 + 1);
  if (!testing) {
    frame(settings.paused || done ? 0 : Math.round(stepRate));
    chart.draw(progress);
    const {T, sigma} = chart.at(progress);
    const {radius, height, steps} = sim.extents;
    say(
      `${T.toFixed(1)}°C, ${(sigma * 100).toFixed(1)}% supersaturated  ·  ` +
        `${2 * radius} cells across, ${2 * height + 1} thick  ·  step ${steps.toLocaleString()}` +
        (done ? '  ·  full grown' : ''),
    );
    randomButton.domElement.classList.toggle('nudge', done);
  }
  requestAnimationFrame(loop);
};

if (innerWidth < 600) gui.close();
load();
if (settings.preset === DRAWN) restart();
else usePreset();
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
    chart.path = toPath(path);
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
    if (path) chart.path = toPath(path);
    restart();
    for (let k = 0; k < steps && !done; k += chunk) {
      frame(chunk);
      await device.queue.onSubmittedWorkDone();
    }
    for (let k = 0; k < 300; k++) {
      frame(0);
      await device.queue.onSubmittedWorkDone();
    }
    chart.draw(progress);
    return {...sim.extents, progress};
  },
};
