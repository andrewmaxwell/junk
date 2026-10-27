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
/** @type {Uint8Array} */
let isRiver;
/** @type {Uint8Array} */
let visited;
/** @type {Uint8Array} */
let hasRiverDonor;
/** @type {any[]} */
const freeFrames = [];

function makeFrame() {
  const num = sim.N * sim.N;
  return {
    height: new Float32Array(num),
    // per point, for the GPU: height, rain, log10 of flow in m³/yr, and ambient occlusion
    fields: new Float32Array(num * 4),
    normal: new Float32Array(num * 4),
    waterY: new Float32Array(num),
    area: new Float32Array(num),
    rain: new Float32Array(num),
    flow: new Float32Array(num),
    receiver: new Int32Array(num),
    time: 0,
    peak: 0,
  };
}

// Horizon-based ambient occlusion: look out along 8 directions at distances growing to about
// 40 cells, and darken a point by how much of the sky the highest ground in each direction hides.
const AO_STEPS = [1, 2, 3, 5, 8, 12, 18, 27, 40];
const AO_DIRECTIONS = Array.from({length: 8}, (_, k) => [
  Math.cos((k * Math.PI) / 4),
  Math.sin((k * Math.PI) / 4),
]);

function ambientOcclusion(i, x, z) {
  const {N, cellSize, height} = sim;
  const h = height[i];
  let hidden = 0;
  for (const [dx, dz] of AO_DIRECTIONS) {
    let best = 0;
    for (const d of AO_STEPS) {
      const sx = Math.round(x + dx * d);
      const sz = Math.round(z + dz * d);
      if (sx < 0 || sz < 0 || sx >= N || sz >= N) break;
      const slope = (height[sz * N + sx] - h) / (d * cellSize);
      if (slope > best) best = slope;
    }
    hidden += best / Math.sqrt(1 + best * best); // sine of the horizon's angle
  }
  return 1 - hidden / AO_DIRECTIONS.length;
}

/** Fill a frame from the current state. Assumes route() has run since the last change. */
function fillFrame(f) {
  const {N, cellSize, height, water, wet, area, rain, discharge} = sim;
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
      f.fields[i * 4] = h;
      f.fields[i * 4 + 1] = rain[i];
      f.fields[i * 4 + 2] = Math.log10(Math.max(1, discharge[i]));
      f.fields[i * 4 + 3] = ambientOcclusion(i, x, z);

      const hl = height[x > 0 ? i - 1 : i];
      const hr = height[x < N - 1 ? i + 1 : i];
      const hu = height[z > 0 ? i - N : i];
      const hd = height[z < N - 1 ? i + N : i];
      const nx = -(hr - hl) / (2 * cellSize);
      const nz = -(hd - hu) / (2 * cellSize);
      const len = Math.hypot(nx, 1, nz);
      f.normal[i * 4] = nx / len;
      f.normal[i * 4 + 1] = 1 / len;
      f.normal[i * 4 + 2] = nz / len;

      // Lakes are flat sheets at their spill height, reaching one point past the shore so the
      // ground cuts a clean shoreline through them. Everywhere else the sheet tucks well under
      // the ground.
      let level = wet[i] === 1 ? water[i] : -Infinity;
      if (level === -Infinity) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx2 = x + dx;
            const nz2 = z + dz;
            if (nx2 < 0 || nz2 < 0 || nx2 >= N || nz2 >= N) continue;
            const j = nz2 * N + nx2;
            if (wet[j] === 1) level = Math.max(level, water[j]);
          }
        }
      }
      f.waterY[i] = level > -Infinity ? level : h - 40; // below the GPU's finer relief too
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

  const out = {position: [], center: [], side: []};
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
      // Width in meters is 5 √Q, Q in m³/s (Leopold and Maddock's hydraulic geometry), at
      // least 2 m. The shader widens far-off rivers so they don't vanish.
      const half = Math.max(1, 2.5 * Math.sqrt(q / 3.156e7)) / cellSize;
      const [ox, oz] = [(-(nz - pz) / len) * half, ((nx - px) / len) * half];
      // Level across at the height of the middle, so it lies in the valley floor. Each vertex
      // carries the middle's grid position, so the GPU can set it on the same smoothed ground
      // the terrain uses, and which bank it's on, to soften the edges.
      const y = surface(x, z) + 1.5;
      return [
        [x + ox, z + oz, 0],
        [x - ox, z - oz, 1],
      ].map(([gx, gz, side]) => [world(gx), y, world(gz), x, z, side]);
    });
    for (let k = 0; k < edges.length - 1; k++) {
      const [a, b] = edges[k];
      const [c, d] = edges[k + 1];
      for (const v of [a, c, b, b, c, d]) {
        out.position.push(v[0], v[1], v[2]);
        out.center.push(v[3], v[4]);
        out.side.push(v[5]);
      }
    }
  }
  return {
    position: new Float32Array(out.position),
    center: new Float32Array(out.center),
    side: new Float32Array(out.side),
  };
}

function send() {
  if (!dirty || !freeFrames.length) return;
  const f = freeFrames.pop();
  fillFrame(f);
  dirty = false;
  f.rivers = buildRivers();
  postMessage({type: 'frame', frame: f}, [
    f.rivers.position.buffer,
    f.rivers.center.buffer,
    f.rivers.side.buffer,
    f.fields.buffer,
    f.height.buffer,
    f.normal.buffer,
    f.waterY.buffer,
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
