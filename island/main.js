import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {makeRenderer} from './makeRenderer.js';
import {defaults} from './sim.js';

const lowPower = matchMedia('(pointer: coarse)').matches;
const N = lowPower ? 256 : 384;
const ISLAND_SIZE = 12800; // m across the whole grid
const cellSize = ISLAND_SIZE / (N - 1);
const BRUSH_RADIUS = 700; // m
const BRUSH_RATE = 400; // m/s at the middle of the brush
// thousand years per second: slow enough to watch a valley deepen or a lake fill (at 100 a
// volcano rose and wore away in under half a minute)
const SPEED = 10;
// the hour the sun is low enough for long shadows, warm light and shafts through the clouds
const GOLDEN_HOUR = 17.3;

const canvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById('app')
);
const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');

/** @param {string} message */
function fail(message) {
  document.getElementById('error').textContent = message;
  document.getElementById('error').hidden = false;
}

const url = new URLSearchParams(location.search);
const settings = {
  tool: 'Look',
  rain: +(url.get('rain') ?? defaults.rain),
  wind: +(url.get('wind') ?? defaults.wind),
  temperature: +(url.get('temp') ?? defaults.temperature),
  upliftRate: +(url.get('uplift') ?? defaults.upliftRate),
  seaLevel: +(url.get('sea') ?? defaults.seaLevel),
  iceAges: url.get('ice') === '1',
  speed: SPEED, // thousand years per second
  hour: +(url.get('hour') ?? GOLDEN_HOUR),
  clouds: url.get('clouds') !== '0',
  seed: +(url.get('seed') ?? 0) || newSeed(),
};

function newSeed() {
  return 1 + Math.floor(Math.random() * 99999);
}

function saveUrl() {
  const q = new URLSearchParams({seed: String(settings.seed)});
  if (settings.rain !== defaults.rain) q.set('rain', String(settings.rain));
  if (settings.wind !== defaults.wind) q.set('wind', String(settings.wind));
  if (settings.temperature !== defaults.temperature)
    q.set('temp', String(settings.temperature));
  if (settings.upliftRate !== defaults.upliftRate)
    q.set('uplift', String(settings.upliftRate));
  if (settings.seaLevel !== defaults.seaLevel)
    q.set('sea', String(settings.seaLevel));
  if (settings.iceAges) q.set('ice', '1');
  if (settings.hour !== GOLDEN_HOUR) q.set('hour', String(settings.hour));
  if (!settings.clouds) q.set('clouds', '0');
  history.replaceState(null, '', '?' + q);
}

let view;
try {
  view = makeRenderer(canvas, {N, cellSize, lowPower});
} catch (e) {
  fail(`This needs WebGL, which didn't start here (${e.message}).`);
  throw e;
}

const worker = new Worker(new URL('./worker.js', import.meta.url), {
  type: 'module',
});
worker.onerror = (e) =>
  fail(`The simulation stopped: ${e.message || 'the worker failed to load'}.`);

function sendParams() {
  worker.postMessage({
    type: 'params',
    params: {
      rain: settings.rain,
      wind: settings.wind,
      temperature: settings.temperature,
      upliftRate: settings.upliftRate,
      seaLevel: settings.seaLevel,
      iceAges: settings.iceAges,
    },
    speed: settings.speed * 1000,
  });
  view.setSpeed(settings.speed * 1000);
  saveUrl();
}

function newIsland(seed) {
  settings.seed = seed;
  worker.postMessage({type: 'init', N, cellSize, seed, restart: started});
  started = true;
  sendParams();
  view.reframe();
}
let started = false;

/** @type {any} */
let frame = null;
/** @type {any} */
let shown = null;
worker.onmessage = ({data}) => {
  if (data.type !== 'frame') return;
  if (frame) worker.postMessage({type: 'frame', frame}, transfers(frame));
  frame = data.frame;
};
const transfers = (f) =>
  [
    f.height,
    f.fields,
    f.normal,
    f.ground,
    f.waterY,
    f.cloud,
    f.heat,
    f.rivers,
  ].map((a) => a.buffer);

// ---------- controls ----------
// Each changes the world and keeps the island, so you can watch it adjust.
const presets = {
  'Hotspot island': {},
  'Sinking: atoll': {upliftRate: -1, speed: 30},
  'Ice-age cycles': {iceAges: true},
  'Ice age': {seaLevel: -120, temperature: 18},
  Desert: {rain: 0.3, temperature: 28},
  'Arctic island': {temperature: -2, rain: 1},
};
const presetSettings = (name) => ({
  rain: defaults.rain,
  wind: defaults.wind,
  temperature: defaults.temperature,
  upliftRate: defaults.upliftRate,
  seaLevel: defaults.seaLevel,
  iceAges: false,
  speed: SPEED,
  ...presets[name],
});
settings.preset =
  Object.keys(presets).find((name) =>
    Object.entries(presetSettings(name)).every(
      ([key, value]) => key === 'speed' || settings[key] === value,
    ),
  ) ?? 'Custom';
if (settings.preset !== 'Custom')
  settings.speed = presetSettings(settings.preset).speed;

const gui = new GUI({title: 'Island', width: innerWidth < 600 ? 170 : 245});
gui
  .add(settings, 'preset', [...Object.keys(presets), 'Custom'])
  .name('World')
  .onChange((name) => {
    if (name === 'Custom') return;
    Object.assign(settings, presetSettings(name));
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    sendParams();
  });
gui
  .add(settings, 'tool', ['Look', 'Raise', 'Lower'])
  .name('Tool')
  .onChange(setTool);
gui
  .add(settings, 'rain', 0, 4, 0.1)
  .name('Rain (m/yr)')
  .onChange(changeClimate);
gui
  .add(settings, 'wind', 0, 355, 5)
  .name('Wind from (°)')
  .onChange(changeClimate);
gui
  .add(settings, 'temperature', -10, 35, 1)
  .name('Sea-level temp (°C)')
  .onChange(changeClimate);
gui
  .add(settings, 'upliftRate', -2, 5, 0.1)
  .name('Uplift (mm/yr)')
  .onChange(changeClimate);
gui
  .add(settings, 'seaLevel', -300, 300, 5)
  .name('Sea level (m)')
  .onChange(changeClimate);
gui.add(settings, 'iceAges').name('Ice-age cycles').onChange(changeClimate);
gui
  .add(settings, 'hour', 0, 24, 0.1)
  .name('Time of day (h)')
  .onChange(() => {
    view.setHour(settings.hour);
    saveUrl();
  });
gui
  .add(settings, 'clouds')
  .name('Clouds')
  .onChange(() => {
    view.setClouds(settings.clouds);
    saveUrl();
  });
const speedController = gui
  .add(settings, 'speed', 0, 200, 1)
  .name('Speed (kyr/s)')
  .onChange(sendParams);
gui.add({island: () => newIsland(newSeed())}, 'island').name('New island');
if (lowPower || innerWidth < 600) gui.close();

function changeClimate() {
  settings.preset = 'Custom';
  gui.controllersRecursive()[0].updateDisplay();
  sendParams();
}

let lastSpeed = settings.speed;
addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.target !== document.body) return;
  e.preventDefault();
  [settings.speed, lastSpeed] = settings.speed
    ? [0, settings.speed]
    : [lastSpeed || SPEED, 0];
  speedController.updateDisplay();
  sendParams();
});

function setTool() {
  const sculpting = settings.tool !== 'Look';
  view.controls.mouseButtons.LEFT = sculpting ? -1 : 0; // 0 is rotate
  view.controls.touches.ONE = sculpting ? -1 : 0;
  canvas.style.cursor = sculpting ? 'crosshair' : '';
}

// ---------- sculpting ----------
/** @type {Map<number, {x: number, y: number}>} */
const pointers = new Map();
let painting = null;

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  hintEl.classList.add('gone');
  view.controls.autoRotate = false;
  const single = pointers.size === 1 && e.button === 0;
  painting =
    single && settings.tool !== 'Look' ? {x: e.clientX, y: e.clientY} : null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (painting) painting = {x: e.clientX, y: e.clientY};
});
const release = (e) => {
  pointers.delete(e.pointerId);
  painting = null;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

const fmt = (v, digits = 0) =>
  v.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });

function formatYears(years) {
  if (years < 1e6) return `${fmt(Math.round(years / 1000) * 1000)} years`;
  return `${fmt(years / 1e6, 2)} million years`;
}

// ---------- loop ----------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (painting && pointers.size === 1) {
    const hit = view.pick(painting.x, painting.y);
    if (hit) {
      worker.postMessage({
        type: 'brush',
        x: hit.x,
        z: hit.z,
        radius: BRUSH_RADIUS / cellSize,
        amount: (settings.tool === 'Raise' ? 1 : -1) * BRUSH_RATE * dt,
      });
    }
  }
  if (frame && frame !== shown) {
    view.update(frame, frame.seaLevel, settings.temperature, settings.wind);
    shown = frame;
    const seaShift = frame.seaLevel - settings.seaLevel;
    const speed = Math.abs(frame.rise);
    const rate = speed >= 0.95 ? speed.toFixed(1) : speed.toPrecision(1);
    statusEl.textContent = `${formatYears(frame.time)} · peak ${fmt(Math.max(0, frame.peak - frame.seaLevel))} m · ${frame.rise > 0 ? 'volcano growing' : 'sinking'} ${rate} mm/yr${settings.iceAges ? ` · sea ${seaShift < -0.5 ? '−' + fmt(-seaShift) : '0'} m` : ''}${settings.speed ? '' : ' · paused'}`;
  }
  view.render();
  // paused, it still runs until the first island is drawn, so there's something to look at
  if (paused && shown) looping = false;
  else requestAnimationFrame(loop);
}

// Stop simulating and drawing while the page is hidden or another window has focus: left open
// behind other work it took a CPU core and much of the GPU.
let paused = false;
let looping = true;
function checkPaused() {
  const pause = document.hidden || !document.hasFocus();
  if (pause === paused) return;
  paused = pause;
  worker.postMessage({type: 'pause', paused});
  if (!paused && !looping) {
    looping = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}
addEventListener('blur', checkPaused);
addEventListener('focus', checkPaused);
document.addEventListener('visibilitychange', checkPaused);

setTool();
view.setHour(settings.hour);
view.setClouds(settings.clouds);
newIsland(settings.seed);
requestAnimationFrame(loop);
checkPaused();
