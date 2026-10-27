// Runs the landscape model off the main thread and turns it into ready-to-draw vertex data.
import {makeSim, defaults, potentialEvaporation, smooth} from './sim.js';

const STEP_YEARS = 2000;
const BUDGET_MS = 30; // longest stretch of stepping before checking for messages

/** @type {ReturnType<typeof makeSim>} */
let sim;
let params = {...defaults};
let speed = 0; // years per real second
let yearsDue = 0;
let lastTick = performance.now();
let dirty = true;
/** @type {Uint8Array} */
let isRiver;
/** @type {Uint8Array} */
let visited;
/** @type {Uint8Array} */
let hasRiverDonor;
/** @type {any[]} */
const freeFrames = [];

// palette in sRGB, converted to linear for three.js vertex colors
const lin = (c) => c.map((v) => Math.pow(v, 2.2));
const sand = lin([0.86, 0.79, 0.6]);
const wetSand = lin([0.62, 0.6, 0.47]);
const shelf = lin([0.35, 0.55, 0.5]);
const deep = lin([0.05, 0.12, 0.17]);
const rainforest = lin([0.1, 0.3, 0.09]);
const forest = lin([0.2, 0.36, 0.14]);
const conifer = lin([0.12, 0.24, 0.15]);
const grass = lin([0.52, 0.55, 0.27]);
const scrub = lin([0.62, 0.55, 0.34]);
const desert = lin([0.84, 0.69, 0.47]);
const tundra = lin([0.5, 0.48, 0.38]);
const rock = lin([0.42, 0.42, 0.36]);
const snow = lin([0.93, 0.95, 0.98]);
const lakeColor = lin([0.06, 0.2, 0.26]);

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
  const {seaLevel} = params;
  const c = [0, 0, 0];
  let peak = -Infinity;
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
        // the same bands as biome() in sim.js, blended so they shade into each other
        const t = params.temperature - 0.0065 * above;
        const potential = potentialEvaporation(t);
        const aridity = potential > 0 ? rain[i] / potential : 10;
        mix(c, conifer, forest, smooth(4, 10, t));
        blend(c, rainforest, smooth(15, 21, t));
        blend(c, grass, smooth(0.9, 0.7, aridity));
        blend(c, scrub, smooth(0.55, 0.4, aridity));
        blend(c, desert, smooth(0.3, 0.15, aridity));
        blend(c, tundra, smooth(5, 2, t));
        blend(c, sand, smooth(5, 1, above) * smooth(0.4, 0.15, steep));
        blend(c, rock, smooth(0.9, 1.6, steep) * 0.85);
        blend(c, snow, smooth(-1, -3, t) * smooth(1.2, 0.6, steep));
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

const RIVER_MIN_FLOW = 0.02 * 3.156e7; // m³/yr, about 20 liters a second

/**
 * Smooth ribbons along every river, as triangles in world coordinates: trace each river from
 * its head down to where it joins a bigger one or reaches still water, round off the grid's
 * zigzags (Chaikin's corner cutting), and give it a width that grows with its flow.
 */
function buildRivers() {
  const {N, cellSize, height, water, wet, discharge, receiver} = sim;
  const num = N * N;
  const {seaLevel} = params;
  hasRiverDonor.fill(0);
  visited.fill(0);
  for (let i = 0; i < num; i++) {
    isRiver[i] = +(
      !wet[i] &&
      height[i] >= seaLevel &&
      discharge[i] >= RIVER_MIN_FLOW &&
      receiver[i] !== i
    );
  }
  for (let i = 0; i < num; i++) if (isRiver[i]) hasRiverDonor[receiver[i]] = 1;

  // water surface or ground, bilinear, at fractional grid coordinates
  const surface = (gx, gz) => {
    const x = Math.min(Math.max(Math.floor(gx), 0), N - 2);
    const z = Math.min(Math.max(Math.floor(gz), 0), N - 2);
    const fx = Math.min(1, Math.max(0, gx - x));
    const fz = Math.min(1, Math.max(0, gz - z));
    const at = (i) => Math.max(height[i], wet[i] ? water[i] : -Infinity);
    const i = z * N + x;
    return (
      (at(i) * (1 - fx) + at(i + 1) * fx) * (1 - fz) +
      (at(i + N) * (1 - fx) + at(i + N + 1) * fx) * fz
    );
  };
  const world = (g) => (g - (N - 1) / 2) * cellSize;

  const out = [];
  for (let head = 0; head < num; head++) {
    if (!isRiver[head] || hasRiverDonor[head]) continue;
    // [x, z, flow] along the river
    let points = [];
    let i = head;
    for (;;) {
      points.push([i % N, Math.floor(i / N), discharge[i]]);
      if (!isRiver[i] || visited[i]) break;
      visited[i] = 1;
      i = receiver[i];
    }
    if (points.length < 2) continue;
    for (let pass = 0; pass < 2; pass++) {
      const next = [points[0]];
      for (let k = 0; k < points.length - 1; k++) {
        const [a, b] = [points[k], points[k + 1]];
        const lerp = (t) => a.map((v, j) => v + (b[j] - v) * t);
        next.push(lerp(0.25), lerp(0.75));
      }
      next.push(points[points.length - 1]);
      points = next;
    }
    // two edge points per center point, then two triangles per stretch
    const edges = points.map(([x, z, q], k) => {
      const [px, pz] = points[Math.max(0, k - 1)];
      const [nx, nz] = points[Math.min(points.length - 1, k + 1)];
      const len = Math.hypot(nx - px, nz - pz) || 1;
      // Width in meters is 12 + 70 √Q, Q in m³/s: several times wider than real rivers, so
      // even creeks show from across the island.
      const half = (6 + 35 * Math.sqrt(q / 3.156e7)) / cellSize;
      const [ox, oz] = [(-(nz - pz) / len) * half, ((nx - px) / len) * half];
      // level across, at the height of the middle, so it lies in the valley floor
      const y = surface(x, z) + 1.5;
      return [
        [x + ox, z + oz],
        [x - ox, z - oz],
      ].map(([gx, gz]) => [world(gx), y, world(gz)]);
    });
    for (let k = 0; k < edges.length - 1; k++) {
      const [a, b] = edges[k];
      const [c, d] = edges[k + 1];
      out.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
  }
  return new Float32Array(out);
}

function send() {
  if (!dirty || !freeFrames.length) return;
  const f = freeFrames.pop();
  fillFrame(f);
  dirty = false;
  f.rivers = buildRivers();
  postMessage({type: 'frame', frame: f}, [
    f.rivers.buffer,
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
    isRiver = new Uint8Array(data.N * data.N);
    visited = new Uint8Array(data.N * data.N);
    hasRiverDonor = new Uint8Array(data.N * data.N);
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
