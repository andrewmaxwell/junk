// Runs the landscape model off the main thread and turns it into ready-to-draw vertex data.
import {makeSim, defaults} from './sim.js';

const STEP_YEARS = 2000;
const BUDGET_MS = 30; // longest stretch of stepping before checking for messages

/** @type {ReturnType<typeof makeSim>} */
let sim;
let params = {...defaults};
let speed = 0; // years per real second
let yearsDue = 0;
let lastTick = performance.now();
let dirty = true;
/** @type {Float32Array} */
let river;
/** @type {Float32Array} */
let wide;
/** @type {any[]} */
const freeFrames = [];

// palette in sRGB, converted to linear for three.js vertex colors
const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const sand = lin([0.86, 0.79, 0.6]);
const wetSand = lin([0.62, 0.6, 0.47]);
const shelf = lin([0.35, 0.55, 0.5]);
const deep = lin([0.05, 0.12, 0.17]);
const lowland = lin([0.24, 0.45, 0.17]);
const forest = lin([0.13, 0.3, 0.12]);
const upland = lin([0.42, 0.45, 0.26]);
const dry = lin([0.6, 0.53, 0.33]); // grass and scrub where little rain falls
const alpine = lin([0.52, 0.49, 0.41]);
const rock = lin([0.42, 0.42, 0.36]);
const snow = lin([0.93, 0.95, 0.98]);
const lakeColor = lin([0.06, 0.2, 0.26]);

const riverColor = lin([0.16, 0.33, 0.42]);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (a, b, t) => {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const mix = (out, a, b, t) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};
const blend = (out, b, t) => mix(out, out, b, t);

function makeFrame() {
  const num = sim.N * sim.N;
  return {
    height: new Float32Array(num),
    normal: new Float32Array(num * 3),
    color: new Uint8Array(num * 3),
    waterY: new Float32Array(num),
    waterColor: new Uint8Array(num * 4),
    area: new Float32Array(num),
    rain: new Float32Array(num),
    flow: new Float32Array(num),
    receiver: new Int32Array(num),
    time: 0,
    peak: 0,
  };
}

/** Fill a frame from the current state. Assumes route() has run since the last change. */
function fillFrame(f) {
  const {N, cellSize, height, water, wet, area, rain, discharge} = sim;
  const num = N * N;
  const {seaLevel} = params;
  const c = [0, 0, 0];
  let peak = -Infinity;

  // How river-like each point is, from its discharge. Big rivers spread into the points beside
  // them, since a single grid cell is narrower than a pixel from most views.
  for (let i = 0; i < num; i++) {
    const q = Math.log10(discharge[i]);
    river[i] = wet[i] || height[i] < seaLevel ? 0 : smooth(5.5, 6.3, q);
    wide[i] = river[i] * smooth(6.6, 7.6, q);
  }
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const h = height[i];
      f.height[i] = h;
      f.area[i] = area[i];
      f.rain[i] = rain[i];
      f.flow[i] = discharge[i];
      if (h > peak) peak = h;

      const hl = height[x > 0 ? i - 1 : i];
      const hr = height[x < N - 1 ? i + 1 : i];
      const hu = height[z > 0 ? i - N : i];
      const hd = height[z < N - 1 ? i + N : i];
      const nx = -(hr - hl) / (2 * cellSize);
      const nz = -(hd - hu) / (2 * cellSize);
      const len = Math.hypot(nx, 1, nz);
      f.normal[i * 3] = nx / len;
      f.normal[i * 3 + 1] = 1 / len;
      f.normal[i * 3 + 2] = nz / len;
      const steep = Math.hypot(nx, nz); // slope as rise over run

      const above = h - seaLevel;
      if (above < 0) {
        mix(c, wetSand, shelf, smooth(0, 15, -above));
        blend(c, deep, smooth(10, 250, -above));
      } else {
        mix(c, lowland, forest, smooth(20, 200, above) * 0.8);
        blend(c, dry, smooth(1.1, 0.35, rain[i]) * 0.85);
        blend(c, upland, smooth(300, 900, above));
        blend(c, alpine, smooth(900, 1500, above));
        blend(c, sand, smooth(5, 1, above) * smooth(0.4, 0.15, steep));
        blend(c, rock, smooth(0.9, 1.6, steep) * 0.85); // wet islands stay green on steep slopes
        blend(c, snow, smooth(1700, 2000, above) * smooth(1.2, 0.6, steep));
        const t = Math.max(
          river[i],
          wide[x > 0 ? i - 1 : i],
          wide[x < N - 1 ? i + 1 : i],
          wide[z > 0 ? i - N : i],
          wide[z < N - 1 ? i + N : i],
        );
        blend(c, riverColor, t * 0.9);
      }
      f.color[i * 3] = c[0] * 255;
      f.color[i * 3 + 1] = c[1] * 255;
      f.color[i * 3 + 2] = c[2] * 255;

      // Lakes are flat sheets at their spill height. Everywhere else the water mesh tucks
      // under the ground.
      const lake = wet[i] === 1;
      f.waterY[i] = lake ? water[i] : h - 4;
      f.waterColor[i * 4] = lakeColor[0] * 255;
      f.waterColor[i * 4 + 1] = lakeColor[1] * 255;
      f.waterColor[i * 4 + 2] = lakeColor[2] * 255;
      f.waterColor[i * 4 + 3] = lake ? 200 : 0;
    }
  }
  f.receiver.set(sim.receiver);
  f.time = sim.time;
  f.peak = peak;
}

function send() {
  if (!dirty || !freeFrames.length) return;
  const f = freeFrames.pop();
  fillFrame(f);
  dirty = false;
  postMessage({type: 'frame', frame: f}, [
    f.height.buffer,
    f.normal.buffer,
    f.color.buffer,
    f.waterY.buffer,
    f.waterColor.buffer,
    f.area.buffer,
    f.rain.buffer,
    f.flow.buffer,
    f.receiver.buffer,
  ]);
}

function tick() {
  const now = performance.now();
  yearsDue = Math.min(
    yearsDue + ((now - lastTick) / 1000) * speed,
    STEP_YEARS * 20,
  );
  lastTick = now;
  while (yearsDue >= STEP_YEARS && performance.now() - now < BUDGET_MS) {
    sim.step(STEP_YEARS, params);
    yearsDue -= STEP_YEARS;
    dirty = true;
  }
  if (performance.now() - now >= BUDGET_MS) yearsDue = 0; // can't keep up: go as fast as we can
  if (dirty) sim.route(params);
  send();
  setTimeout(tick, yearsDue >= STEP_YEARS ? 0 : 8);
}

onmessage = ({data}) => {
  if (data.type === 'init') {
    sim = makeSim({N: data.N, cellSize: data.cellSize, seed: data.seed});
    freeFrames.length = 0;
    freeFrames.push(makeFrame(), makeFrame());
    river = new Float32Array(data.N * data.N);
    wide = new Float32Array(data.N * data.N);
    sim.route(params);
    dirty = true;
    yearsDue = 0;
    if (!data.restart) tick();
  } else if (data.type === 'params') {
    params = {...params, ...data.params};
    speed = data.speed;
    sim.route(params);
    dirty = true;
  } else if (data.type === 'brush') {
    sim.brush(data.x, data.z, data.radius, data.amount);
    sim.route(params);
    dirty = true;
  } else if (data.type === 'frame') {
    if (data.frame.height.length === sim.N * sim.N) freeFrames.push(data.frame);
  }
};
