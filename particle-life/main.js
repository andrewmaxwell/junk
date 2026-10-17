import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {makeInput, tools} from './input.js';
import {makeRenderer} from './render.js';
import {makeSim} from './sim.js';

const fail = (msg) => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="position:fixed;top:40%;width:100%;text-align:center;color:white;font:18px sans-serif">${msg}</p>`,
  );
  throw new Error(msg);
};

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) fail('This needs a browser with WebGPU support.');
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  },
});
device.lost.then((info) => fail(`GPU device lost: ${info.message}`));

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({device, format});

const sim = makeSim(device);
const renderer = makeRenderer(device, context, format);

const defaults = {
  numParticles: 200000,
  numColors: 8,
  radius: 12,
  friction: 0.9,
  force: 0.002,
  repulsion: 5,
  // every pair pushes apart inside this fraction of radius
  core: 0.3,
  // shortest reach a pair of colors can get, as a fraction of radius
  minReach: 0.5,
  stepsPerFrame: 1,
  dotSize: 2,
  brightness: 1.5,
  trails: 0.8,
  streaks: 3,
  tool: 'stir',
  brushSize: 60,
  strength: 0.5,
  paintColor: 0,
};
// what the pointer does, rather than part of the world, so not in the URL
const unshared = ['tool', 'brushSize', 'strength', 'paintColor'];
const params = {...defaults};
const input = makeInput(canvas, params);

let width, height, attractions, reaches;

// fully saturated colors evenly spaced around the color wheel, as 0-1 rgb
const palette = (n) =>
  Array.from({length: n}, (_, c) => {
    const h = (c / n) * 6;
    const x = 1 - Math.abs((h % 2) - 1);
    return [
      [1, x, 0],
      [x, 1, 0],
      [0, 1, x],
      [0, x, 1],
      [x, 0, 1],
      [1, 0, x],
    ][Math.floor(h)].map((v) => 0.25 + 0.75 * v);
  });
let colors = palette(params.numColors);
const css = (rgb) => `rgb(${rgb.map((v) => v * 255).join(',')})`;

const resize = () => {
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  renderer.resize(canvas.width, canvas.height);
  sim.setGrid(width, height, params.radius);
  input.setSize(width, height);
};

// rounded so that the link in the URL brings back exactly the same rules
const round = (x) => Math.round(x * 100) / 100;

const randomizeRules = () => {
  const {numColors, minReach} = params;
  const between = (min, max) => round(min + Math.random() * (max - min));
  attractions = new Float32Array(numColors * numColors);
  reaches = new Float32Array(numColors * numColors);
  for (let i = 0; i < numColors * numColors; i++) {
    attractions[i] = between(-1, 1);
    reaches[i] = between(minReach, 1);
  }
  rulesChanged();
};

const reset = () => {
  const {numParticles, numColors, radius} = params;
  const data = new Float32Array(numParticles * 4);
  const colorData = new Uint32Array(numParticles);
  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = (Math.random() * radius) / 32;
    data.set(
      [
        Math.random() * width,
        Math.random() * height,
        speed * Math.cos(angle),
        speed * Math.sin(angle),
      ],
      i * 4,
    );
    colorData[i] = i % numColors;
  }
  sim.setParticles(data, colorData);
};

const restart = () => {
  colors = palette(params.numColors);
  params.paintColor = Math.min(params.paintColor, params.numColors - 1);
  reset();
  randomizeRules();
};

let lastCam = {};

const loop = () => {
  const encoder = device.createCommandEncoder();
  const {cam} = input;
  // trails would smear across the screen when the view jumps, zooms, or pans
  const moved =
    cam.zoom !== lastCam.zoom ||
    (!cam.following && (cam.x !== lastCam.x || cam.y !== lastCam.y));
  lastCam = {...cam};
  sim.step(encoder, params.stepsPerFrame, {
    ...params,
    ...input.frame(params.stepsPerFrame),
    width,
    height,
  });
  renderer.draw(encoder, sim, {
    width,
    height,
    centerX: cam.x,
    centerY: cam.y,
    zoom: cam.zoom,
    streaks: params.streaks,
    dotSize: params.dotSize,
    // a particle sitting still adds up to the same brightness whatever the
    // trail length
    brightness: params.brightness * (1 - params.trails),
    fade: moved ? 0 : params.trails,
    colors,
  });
  device.queue.submit([encoder.finish()]);
  sim.readTracked().then(input.follow);
  requestAnimationFrame(loop);
};

// ---------- rule matrix ----------
// Row = the color being pushed, column = the color doing the pushing. Green
// pulls, red pushes away, and the size of the square is how far it reaches.
// Click to pull more, right-click or shift-click to push more, scroll to
// change the reach. Click a color along the top to paint with it.

const matrix = document.createElement('canvas');
const matrixSize = 220;
const mctx = matrix.getContext('2d');
matrix.width = matrix.height = matrixSize * devicePixelRatio;
matrix.style.cssText = `width:${matrixSize}px; height:${matrixSize}px; display:block; margin:6px auto; cursor:pointer`;

const cellSize = () => matrixSize / (params.numColors + 1);

const drawMatrix = () => {
  const n = params.numColors;
  const s = cellSize();
  mctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  mctx.clearRect(0, 0, matrixSize, matrixSize);
  for (let i = 0; i < n; i++) {
    mctx.fillStyle = css(colors[i]);
    mctx.fillRect(0, (i + 1) * s + 1, s - 2, s - 2);
    mctx.fillRect((i + 1) * s + 1, 0, s - 2, s - 2);
    for (let j = 0; j < n; j++) {
      const a = attractions[i * n + j];
      const x = (j + 1) * s + 1;
      const y = (i + 1) * s + 1;
      mctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      mctx.fillRect(x, y, s - 2, s - 2);
      mctx.fillStyle =
        a > 0 ? `rgba(80, 220, 120, ${a})` : `rgba(240, 80, 80, ${-a})`;
      const size = (s - 2) * reaches[i * n + j];
      const inset = (s - 2 - size) / 2;
      mctx.fillRect(x + inset, y + inset, size, size);
    }
  }
  // underline the paint color
  mctx.fillStyle = 'white';
  mctx.fillRect((params.paintColor + 1) * s + 1, s - 3, s - 2, 2);
};

const cellAt = (e) => {
  const s = cellSize();
  const i = Math.floor(e.offsetY / s) - 1;
  const j = Math.floor(e.offsetX / s) - 1;
  const n = params.numColors;
  return i >= 0 && j >= 0 && i < n && j < n ? i * n + j : -1;
};

const nudge = (e, amount) => {
  e.preventDefault();
  const k = cellAt(e);
  if (k < 0) return;
  attractions[k] = round(Math.max(-1, Math.min(1, attractions[k] + amount)));
  rulesChanged();
  showValue(e);
};

const showValue = (e) => {
  const k = cellAt(e);
  matrix.title =
    k < 0 ? '' : `attraction ${attractions[k]}, reach ${reaches[k]}`;
};

matrix.addEventListener('click', (e) => {
  const s = cellSize();
  const j = Math.floor(e.offsetX / s) - 1;
  if (e.offsetY < s && j >= 0 && j < params.numColors) {
    params.paintColor = j;
    params.tool = 'paint';
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    drawMatrix();
  } else nudge(e, e.shiftKey ? -0.25 : 0.25);
});
matrix.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const k = cellAt(e);
    if (k < 0) return;
    const change = e.deltaY < 0 ? 0.05 : -0.05;
    reaches[k] = round(Math.max(0.1, Math.min(1, reaches[k] + change)));
    rulesChanged();
    showValue(e);
  },
  {passive: false},
);
matrix.addEventListener('contextmenu', (e) => nudge(e, -0.25));
matrix.addEventListener('mousemove', showValue);

// ---------- URL hash ----------
// Holds the settings that differ from the defaults plus the rules, so the
// address is always a link back to the current world.

const format4 = (arr) => [...arr].map((x) => round(x)).join(',');

let hashTimer;
const syncUrl = () => {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const entries = Object.entries(params).filter(
      ([key, value]) => value !== defaults[key] && !unshared.includes(key),
    );
    entries.push(['a', format4(attractions)], ['r', format4(reaches)]);
    const hash = entries.map(([key, value]) => `${key}=${value}`).join('&');
    history.replaceState(null, '', '#' + hash);
  }, 300);
};

const rulesChanged = () => {
  sim.setRules(attractions, reaches);
  drawMatrix();
  syncUrl();
};

const readHash = () => {
  const hash = new URLSearchParams(location.hash.slice(1));
  Object.assign(params, defaults);
  for (const key in defaults) {
    if (unshared.includes(key)) continue;
    const value = Number(hash.get(key));
    if (hash.has(key) && Number.isFinite(value)) params[key] = value;
  }
  colors = palette(params.numColors);
  resize();
  reset();

  const parse = (key) => (hash.get(key) ?? '').split(',').map(Number);
  const a = parse('a');
  const size = params.numColors ** 2;
  if (a.length === size && a.every(Number.isFinite)) {
    attractions = new Float32Array(a);
    // links from before reaches existed had every pair reach all the way
    const r = parse('r');
    reaches =
      r.length === size && r.every(Number.isFinite)
        ? new Float32Array(r)
        : new Float32Array(size).fill(1);
    rulesChanged();
  } else randomizeRules();
};

// ---------- GUI ----------

const gui = new GUI();
gui.add({restart}, 'restart').name('new rules');
gui.add({reset}, 'reset').name('scatter particles');
const mouse = gui.addFolder('mouse').close();
mouse.add(params, 'tool', tools).onChange(() => input.showRing());
mouse.add(params, 'brushSize', 5, 300, 1).onChange(() => input.showRing());
mouse.add(params, 'strength', 0.05, 2, 0.05);
mouse.add({resetView: () => input.resetView()}, 'resetView').name('reset view');
const world = gui.addFolder('world').close();
world.add(params, 'numParticles', 10000, 2000000, 10000).onFinishChange(() => {
  reset();
  syncUrl();
});
world.add(params, 'numColors', 1, 16, 1).onFinishChange(restart);
world.add(params, 'radius', 4, 48, 1).onFinishChange(() => {
  sim.setGrid(width, height, params.radius);
  syncUrl();
});
world.add(params, 'friction', 0.5, 0.99, 0.01).onChange(syncUrl);
world.add(params, 'force', 0.0001, 0.005, 0.0001).onChange(syncUrl);
world.add(params, 'repulsion', 0, 20, 0.1).onChange(syncUrl);
world.add(params, 'core', 0.05, 0.9, 0.01).onChange(syncUrl);
world.add(params, 'minReach', 0.1, 1, 0.01).onFinishChange(randomizeRules);
world.add(params, 'stepsPerFrame', 0, 8, 1).onChange(syncUrl);
const look = gui.addFolder('look').close();
look.add(params, 'dotSize', 0.5, 8, 0.1).onChange(syncUrl);
look.add(params, 'brightness', 0.1, 5, 0.1).onChange(syncUrl);
look.add(params, 'trails', 0, 0.98, 0.01).onChange(syncUrl);
look.add(params, 'streaks', 0, 20, 0.5).onChange(syncUrl);
gui.addFolder('attractions').close().$children.append(matrix);

window.addEventListener('hashchange', () => {
  readHash();
  gui.controllersRecursive().forEach((c) => c.updateDisplay());
});
window.addEventListener('resize', resize);

readHash();
loop();
