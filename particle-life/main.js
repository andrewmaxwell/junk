import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm';
import {makeInput, tools} from './input.js';
import {presets} from './presets.js';
import {makeRenderer} from './render.js';
import {makeSim} from './sim.js';

const fail = (msg) => {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="position:fixed;top:40%;width:100%;padding:0 16px;box-sizing:border-box;text-align:center;color:white;font:18px sans-serif">${msg}</p>`,
  );
  throw new Error(msg);
};

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
  fail(
    'This needs WebGPU, which this browser doesn’t have turned on. Try a recent Chrome, Edge or Safari.',
  );
}
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    maxBufferSize: adapter.limits.maxBufferSize,
  },
});
device.lost.then((info) => fail(`The GPU stopped: ${info.message}`));

const canvas = document.querySelector('canvas');
const context = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({device, format});

const sim = makeSim(device);
const renderer = makeRenderer(device, context, format);

// How far particles feel each other, in world units. Everything that moves
// scales with it, so it only sets the units; `density` is what matters.
const radius = 12;

const defaults = {
  numParticles: 200000,
  numColors: 8,
  // particles per radius x radius square of world
  density: 12,
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

let width, height, world, attractions, reaches;

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

// how far in the camera starts, so that creatures are big enough to see:
// about 400 world units across the screen's shorter side
const closeZoom = () => Math.min(width, height) / 400;

const resize = () => {
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * devicePixelRatio;
  canvas.height = height * devicePixelRatio;
  renderer.resize(canvas.width, canvas.height);
  input.setSize(width, height);
};

// a square that holds numParticles at this density
const setWorld = () => {
  world = Math.round(radius * Math.sqrt(params.numParticles / params.density));
  sim.setGrid(world, world, radius);
  input.setWorld(world);
};

// rounded so that the link in the URL brings back exactly the same rules
const round = (x) => Math.round(x * 100) / 100;

const randomRules = () => {
  const {numColors, minReach} = params;
  const between = (min, max) => round(min + Math.random() * (max - min));
  const a = new Float32Array(numColors * numColors);
  const r = new Float32Array(numColors * numColors);
  for (let i = 0; i < numColors * numColors; i++) {
    a[i] = between(-1, 1);
    r[i] = between(minReach, 1);
  }
  return [a, r];
};

const scatter = () => {
  const {numParticles, numColors} = params;
  setWorld();
  const data = new Float32Array(numParticles * 4);
  const colorData = new Uint32Array(numParticles);
  for (let i = 0; i < numParticles; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const speed = (Math.random() * radius) / 32;
    data.set(
      [
        Math.random() * world,
        Math.random() * world,
        speed * Math.cos(angle),
        speed * Math.sin(angle),
      ],
      i * 4,
    );
    colorData[i] = i % numColors;
  }
  sim.setParticles(data, colorData);
};

// ---------- the main loop ----------

let lastCam = {};
// extra steps to run as fast as the GPU can: {left, resolve}
let warp = null;
// steps per frame while warping, adjusted to keep frames near 60 fps
let warpSpeed = 8;
let lastFrame = performance.now();
let measuring = null;

const loop = () => {
  const now = performance.now();
  const frameTime = now - lastFrame;
  lastFrame = now;
  if (warp) {
    warpSpeed = Math.max(
      2,
      Math.min(64, Math.round(warpSpeed * (frameTime < 20 ? 1.15 : 0.85))),
    );
  }
  const steps = warp ? Math.min(warpSpeed, warp.left) : params.stepsPerFrame;
  const encoder = device.createCommandEncoder();
  const {cam} = input;
  const p = {
    ...params,
    ...input.frame(steps),
    radius,
    width: world,
    height: world,
    measure: !!measuring && !measuring.sent,
  };
  if (p.measure) measuring.sent = true;
  sim.step(encoder, steps, p);
  // trails would smear across the screen when the view jumps, zooms, or pans
  const moved =
    cam.zoom !== lastCam.zoom ||
    (!cam.following && (cam.x !== lastCam.x || cam.y !== lastCam.y));
  lastCam = {...cam};
  renderer.draw(encoder, sim, {
    width,
    height,
    world,
    centerX: cam.x,
    centerY: cam.y,
    zoom: cam.zoom,
    streaks: warp ? 0 : params.streaks,
    dotSize: params.dotSize,
    // a particle sitting still adds up to the same brightness whatever the
    // trail length
    brightness: params.brightness * (1 - params.trails),
    fade: moved ? 0 : params.trails,
    colors,
  });
  device.queue.submit([encoder.finish()]);
  sim.readTracked().then(input.follow);
  if (p.measure) {
    const {resolve} = measuring;
    measuring = null;
    sim.readStats().then(resolve);
  }
  if (warp) {
    warp.left -= steps;
    if (warp.left <= 0) {
      const {resolve} = warp;
      warp = null;
      resolve();
    }
  }
  requestAnimationFrame(loop);
};

/** Runs this many steps as fast as the GPU can. */
const fastForward = (steps) =>
  new Promise((resolve) => (warp = {left: steps, resolve}));

/** How alive the world is after the next step (see sim.readStats). */
const measure = () => new Promise((resolve) => (measuring = {resolve}));

// ---------- finding life ----------
// Most random rules give a fine froth or a frozen crystal. These try rules
// until they find some where particles gather into clumps that swim.

/**
 * How much the world looks like it has creatures: how fast particles move
 * (as a fraction of the radius per step), times how much of that motion is
 * whole cells of particles moving together rather than jiggling in place,
 * times how clumped they are. Calibrated by eye on about 130 random worlds:
 * the dullest froth scores under 0.005, worlds full of swimmers over 0.015,
 * and about one random 8-color world in seven clears `alive`.
 */
const lifeScore = ({speed, together, clumping}) =>
  (speed / radius) * together * Math.min(clumping, 6);
const alive = 0.012;

// the hint goes once someone has touched the world, or after a while
const hint = document.querySelector('#hint');
const hideHint = () => (hint.style.opacity = 0);
canvas.addEventListener('pointerdown', hideHint, {once: true});
setTimeout(hideHint, 15000);

const status = document.querySelector('#status');
const say = (text) => {
  if (text) hideHint();
  status.textContent = text;
  status.style.opacity = text ? 1 : 0;
};

// how long a new world runs before it's judged, in steps
const warmup = 300;
let searchId = 0;

/** Lets the world come alive, then moves the camera to something swimming. */
const showLife = async (id, text = '') => {
  await fastForward(warmup);
  const stats = await measure();
  if (id !== searchId) return null;
  say(text);
  input.glideTo(...stats.liveliest, closeZoom());
  return stats;
};

const findLife = async () => {
  const id = ++searchId;
  choice.preset = '';
  updateGui();
  input.resetView();
  let best = null;
  for (let attempt = 1; attempt <= 20; attempt++) {
    say(`looking for life… ${attempt}`);
    [attractions, reaches] = randomRules();
    rulesChanged();
    scatter();
    await fastForward(warmup);
    const stats = await measure();
    if (id !== searchId) return;
    const score = lifeScore(stats);
    if (score > alive) {
      say('');
      input.glideTo(...stats.liveliest, closeZoom());
      return;
    }
    if (!best || score > best.score) best = {score, attractions, reaches};
  }
  ({attractions, reaches} = best);
  rulesChanged();
  scatter();
  showLife(id, 'nothing very alive turned up, so here’s the liveliest');
};

/** Starts the world in a hash or a preset from scattered particles. */
const startWorld = (hash) => {
  const id = ++searchId;
  if (!loadHash(hash)) return findLife();
  input.resetView();
  say('');
  showLife(id);
};

// ---------- rule matrix ----------
// Row = the color being pushed, column = the color doing the pushing. Green
// pulls, red pushes away, and the size of the square is how far it reaches.
// Click or tap to pull more, right-click, shift-click or long-press to push
// more, scroll to change the reach. Tap a color along the top to paint with it.

const matrix = document.createElement('canvas');
const matrixSize = 220;
const mctx = matrix.getContext('2d');
matrix.width = matrix.height = matrixSize * devicePixelRatio;
matrix.style.cssText = `width:${matrixSize}px; height:${matrixSize}px; display:block; margin:6px auto; cursor:pointer; touch-action:none; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none`;

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

// a press is a tap until it's held long enough to be a long-press
let press = null;
matrix.addEventListener('pointerdown', (e) => {
  const s = cellSize();
  const j = Math.floor(e.offsetX / s) - 1;
  if (e.offsetY < s && j >= 0 && j < params.numColors) {
    params.paintColor = j;
    params.tool = 'paint';
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
    drawMatrix();
    return;
  }
  if (e.button === 2 || e.shiftKey) {
    nudge(e, -0.25);
    return;
  }
  const timer = setTimeout(() => {
    nudge(e, -0.25);
    press = null;
  }, 450);
  press = {timer, e};
});
matrix.addEventListener('pointerup', () => {
  if (!press) return;
  clearTimeout(press.timer);
  nudge(press.e, 0.25);
  press = null;
});
matrix.addEventListener('pointercancel', () => {
  clearTimeout(press?.timer);
  press = null;
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
matrix.addEventListener('contextmenu', (e) => e.preventDefault());
matrix.addEventListener('pointermove', showValue);

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

/** Loads the world in a hash. Returns false if it has no rules. */
const loadHash = (text) => {
  const hash = new URLSearchParams(text);
  for (const key in defaults) {
    if (unshared.includes(key)) continue;
    const value = Number(hash.get(key));
    params[key] =
      hash.has(key) && Number.isFinite(value) ? value : defaults[key];
  }
  colors = palette(params.numColors);
  params.paintColor = Math.min(params.paintColor, params.numColors - 1);
  scatter();

  const parse = (key) => (hash.get(key) ?? '').split(',').map(Number);
  const a = parse('a');
  const size = params.numColors ** 2;
  if (a.length !== size || !a.every(Number.isFinite)) return false;
  attractions = new Float32Array(a);
  // links from before reaches existed had every pair reach all the way
  const r = parse('r');
  reaches =
    r.length === size && r.every(Number.isFinite)
      ? new Float32Array(r)
      : new Float32Array(size).fill(1);
  rulesChanged();
  return true;
};

// ---------- GUI ----------

const gui = new GUI();
const presetNames = Object.keys(presets);
const choice = {preset: ''};
gui
  .add(choice, 'preset', ['', ...presetNames])
  .onChange((name) => name && startWorld(presets[name]));
gui.add({findLife}, 'findLife').name('new rules');
gui.add({scatter}, 'scatter').name('scatter particles');
const mouse = gui.addFolder('tool').close();
mouse.add(params, 'tool', tools).onChange(() => input.showRing());
mouse.add(params, 'brushSize', 5, 300, 1).onChange(() => input.showRing());
mouse.add(params, 'strength', 0.05, 2, 0.05);
mouse
  .add({resetView: () => input.resetView()}, 'resetView')
  .name('whole world');
gui.addFolder('attractions').close().$children.append(matrix);
const worldFolder = gui.addFolder('world').close();
worldFolder
  .add(params, 'numParticles', 10000, 2000000, 10000)
  .name('particles')
  .onFinishChange(() => {
    scatter();
    syncUrl();
  });
worldFolder
  .add(params, 'numColors', 1, 16, 1)
  .name('colors')
  .onFinishChange(() => {
    colors = palette(params.numColors);
    params.paintColor = Math.min(params.paintColor, params.numColors - 1);
    findLife();
  });
worldFolder.add(params, 'density', 2, 40, 0.5).onFinishChange(() => {
  scatter();
  syncUrl();
});
worldFolder.add(params, 'friction', 0.5, 0.99, 0.01).onChange(syncUrl);
worldFolder
  .add(params, 'stepsPerFrame', 0, 8, 1)
  .name('speed')
  .onChange(syncUrl);
// tuned together, and easy to make boil
const physics = worldFolder.addFolder('physics').close();
physics.add(params, 'force', 0.0001, 0.005, 0.0001).onChange(syncUrl);
physics.add(params, 'repulsion', 0, 20, 0.1).onChange(syncUrl);
physics.add(params, 'core', 0.05, 0.9, 0.01).onChange(syncUrl);
physics.add(params, 'minReach', 0.1, 1, 0.01).onFinishChange(findLife);
const look = gui.addFolder('look').close();
look.add(params, 'dotSize', 0.5, 8, 0.1).onChange(syncUrl);
look.add(params, 'brightness', 0.1, 5, 0.1).onChange(syncUrl);
look.add(params, 'trails', 0, 0.98, 0.01).onChange(syncUrl);
look.add(params, 'streaks', 0, 20, 0.5).onChange(syncUrl);

if (innerWidth < 600) gui.close();

const updateGui = () =>
  gui.controllersRecursive().forEach((c) => c.updateDisplay());

window.addEventListener('hashchange', () => {
  choice.preset = '';
  startWorld(location.hash.slice(1));
  updateGui();
});
window.addEventListener('resize', resize);

resize();
if (location.hash.length > 1) startWorld(location.hash.slice(1));
else {
  // a first visit opens on one of the hand-picked worlds
  choice.preset = presetNames[Math.floor(Math.random() * presetNames.length)];
  startWorld(presets[choice.preset]);
}
updateGui();
loop();
