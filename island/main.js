import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {makeRenderer} from './makeRenderer.js';
import {defaults} from './sim.js';

const lowPower = matchMedia('(pointer: coarse)').matches;
const N = lowPower ? 256 : 384;
const ISLAND_SIZE = 12800; // m across the whole grid
const cellSize = ISLAND_SIZE / (N - 1);
const BRUSH_RADIUS = 700; // m
const BRUSH_RATE = 400; // m/s at the middle of the brush

const canvas = /** @type {HTMLCanvasElement} */ (
  document.getElementById('app')
);
const statusEl = document.getElementById('status');
const infoEl = document.getElementById('info');
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
  upliftRate: +(url.get('uplift') ?? defaults.upliftRate),
  seaLevel: +(url.get('sea') ?? defaults.seaLevel),
  speed: 100, // thousand years per second
  seed: +(url.get('seed') ?? 0) || newSeed(),
};

function newSeed() {
  return 1 + Math.floor(Math.random() * 99999);
}

function saveUrl() {
  const q = new URLSearchParams({seed: String(settings.seed)});
  if (settings.rain !== defaults.rain) q.set('rain', String(settings.rain));
  if (settings.upliftRate !== defaults.upliftRate)
    q.set('uplift', String(settings.upliftRate));
  if (settings.seaLevel !== defaults.seaLevel)
    q.set('sea', String(settings.seaLevel));
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
      upliftRate: settings.upliftRate,
      seaLevel: settings.seaLevel,
    },
    speed: settings.speed * 1000,
  });
  saveUrl();
}

function newIsland(seed) {
  settings.seed = seed;
  worker.postMessage({type: 'init', N, cellSize, seed, restart: started});
  started = true;
  sendParams();
  probe = null;
  view.reframe();
  infoEl.hidden = true;
  view.showPath([], new Float32Array(0));
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
  [f.height, f.normal, f.color, f.waterY, f.waterColor, f.area, f.receiver].map(
    (a) => a.buffer,
  );

// ---------- controls ----------
const gui = new GUI({title: 'Island', width: innerWidth < 600 ? 170 : 245});
gui
  .add(settings, 'tool', ['Look', 'Raise', 'Lower'])
  .name('Tool')
  .onChange(setTool);
gui.add(settings, 'rain', 0, 4, 0.1).name('Rain (m/yr)').onChange(sendParams);
gui
  .add(settings, 'upliftRate', 0, 5, 0.1)
  .name('Uplift (mm/yr)')
  .onChange(sendParams);
gui
  .add(settings, 'seaLevel', -300, 300, 5)
  .name('Sea level (m)')
  .onChange(sendParams);
const speedController = gui
  .add(settings, 'speed', 0, 500, 10)
  .name('Speed (kyr/s)')
  .onChange(sendParams);
gui.add({island: () => newIsland(newSeed())}, 'island').name('New island');
if (lowPower || innerWidth < 600) gui.close();

let lastSpeed = settings.speed;
addEventListener('keydown', (e) => {
  if (e.key !== ' ' || e.target !== document.body) return;
  e.preventDefault();
  [settings.speed, lastSpeed] = settings.speed
    ? [0, settings.speed]
    : [lastSpeed || 100, 0];
  speedController.updateDisplay();
  sendParams();
});

function setTool() {
  const sculpting = settings.tool !== 'Look';
  view.controls.mouseButtons.LEFT = sculpting ? -1 : 0; // 0 is rotate
  view.controls.touches.ONE = sculpting ? -1 : 0;
  canvas.style.cursor = sculpting ? 'crosshair' : '';
}

// ---------- sculpting and probing ----------
/** @type {Map<number, {x: number, y: number}>} */
const pointers = new Map();
let painting = null;
let tapStart = null;
let probe = null; // grid cell the reader tapped

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  hintEl.classList.add('gone');
  const single = pointers.size === 1 && e.button === 0;
  painting =
    single && settings.tool !== 'Look' ? {x: e.clientX, y: e.clientY} : null;
  tapStart = single ? {x: e.clientX, y: e.clientY, t: performance.now()} : null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
  if (painting) painting = {x: e.clientX, y: e.clientY};
});
const release = (e) => {
  pointers.delete(e.pointerId);
  painting = null;
  if (
    tapStart &&
    e.type === 'pointerup' &&
    Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 8 &&
    performance.now() - tapStart.t < 400
  ) {
    const hit = view.pick(e.clientX, e.clientY);
    probe = hit ? Math.round(hit.z) * N + Math.round(hit.x) : null;
    if (probe === null) {
      infoEl.hidden = true;
      view.showPath([], new Float32Array(0));
    } else if (frame) showProbe();
  }
  tapStart = null;
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

/** Follow a raindrop from the probed cell to the sea, and describe the spot. */
function showProbe() {
  if (probe === null) return;
  const cells = [probe];
  let length = 0;
  for (let i = probe; frame.receiver[i] !== i && cells.length < N * 4; ) {
    const r = frame.receiver[i];
    length +=
      Math.hypot((r % N) - (i % N), Math.floor(r / N) - Math.floor(i / N)) *
      cellSize;
    cells.push(r);
    i = r;
  }
  const surface = frame.height.map((h, i) =>
    Math.max(h, frame.waterY[i], settings.seaLevel),
  );
  view.showPath(cells, surface);

  const h = frame.height[probe];
  const lake = frame.waterY[probe] - h; // rivers sit 0.6 m up, lakes higher
  const area = frame.area[probe];
  const flow = (settings.rain * area) / 3.156e7;
  const lines =
    h < settings.seaLevel
      ? [`${fmt(settings.seaLevel - h)} m under the sea`]
      : [
          `${fmt(h)} m above sea level${lake > 1 ? `, under ${fmt(lake)} m of lake` : ''}`,
          area < 1e6
            ? `${fmt(area / 1e4, 1)} hectares drain through here`
            : `${fmt(area / 1e6, 1)} km² drains through here`,
          flow < 0.1
            ? `about ${fmt(flow * 1000, flow < 0.01 ? 2 : 0)} liters/s of water flows past`
            : `about ${fmt(flow, flow < 10 ? 1 : 0)} m³/s of water flows past`,
          `${fmt(length / 1000, 1)} km to the sea`,
        ];
  infoEl.innerHTML = lines.map((l) => `<div>${l}</div>`).join('');
  infoEl.hidden = false;
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
    view.update(frame, settings.seaLevel);
    shown = frame;
    statusEl.textContent = `${formatYears(frame.time)} · peak ${fmt(Math.max(0, frame.peak - settings.seaLevel))} m${settings.speed ? '' : ' · paused'}`;
    showProbe();
  }
  view.render();
  requestAnimationFrame(loop);
}

setTool();
newIsland(settings.seed);
requestAnimationFrame(loop);
