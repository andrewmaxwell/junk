// Runs the landscape model off the main thread and turns it into ready-to-draw vertex data.
import {makeSim, defaults, iceAgeSeaLevel, LAYER_THICKNESS} from './sim.js';

const STEP_YEARS = 2000;
const BUDGET_MS = 30; // longest stretch of stepping before checking for messages

/** @type {ReturnType<typeof makeSim>} */
let sim;
let params = {...defaults};
let baseSeaLevel = defaults.seaLevel; // the reader's setting, before the ice ages move it
let iceAges = false;
let speed = 0; // years per real second
let yearsDue = 0;
let lastTick = performance.now();
let dirty = true;
// Some things change from one step (2,000 years) to the next in ways that flickered at full
// speed: river mud arrives in pulses and cuts reef growth, and ponds on coastal flats come and
// go. What's drawn eases toward them, so a lake only shows once it has lasted a few steps.
const SHOWN_EASE = 0.25; // per step
/** @type {Float32Array} 0..1, how much each point is shown as lake */
let lakeShown;
/** @type {Float32Array} m, the last level of the lake at each point */
let lakeLevel;
/** @type {Float32Array} reef growth rate as drawn */
let coralShown;
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
    // per point, for drawing the rock: where the layers lie (m, the height a layer boundary
    // would be at here), dikes (0..1), and sediment depth (m)
    ground: new Float32Array(num * 4),
    waterY: new Float32Array(num),
    area: new Float32Array(num),
    rain: new Float32Array(num),
    cloud: new Float32Array(num), // condensed water in the air, for drawing clouds
    flow: new Float32Array(num),
    receiver: new Int32Array(num),
    rivers: new Uint8Array(((sim.N - 1) * RIVER_TEXELS + 1) ** 2 * 4),
    time: 0,
    peak: 0,
    seaLevel: 0,
  };
}

// Horizon-based ambient occlusion: look out along 8 directions at distances growing to about
// 40 cells, and darken a point by how much of the sky the highest ground in each direction hides.
// It was most of the frame's time, so each frame only redoes every AO_BANDS-th row; the
// shading lags the ground by a few frames, which nobody can see.
const AO_BANDS = 4;
const AO_STEPS = [1, 2, 3, 5, 8, 12, 18, 27, 40];
const AO_DIRECTIONS = 8;
// grid offsets and distances of each sample, direction by direction, in flat arrays:
// destructuring little arrays in this loop made the whole frame several times slower
const aoDx = new Int32Array(AO_DIRECTIONS * AO_STEPS.length);
const aoDz = new Int32Array(aoDx.length);
const aoDistance = new Float64Array(aoDx.length);
for (let k = 0; k < AO_DIRECTIONS; k++) {
  AO_STEPS.forEach((d, s) => {
    const j = k * AO_STEPS.length + s;
    aoDx[j] = Math.round(Math.cos((k * Math.PI) / 4) * d);
    aoDz[j] = Math.round(Math.sin((k * Math.PI) / 4) * d);
    aoDistance[j] = d;
  });
}
let aoBand = 0;
/** @type {Float32Array} */
let occlusion;

function updateOcclusion() {
  const {N, cellSize, height} = sim;
  for (let z = aoBand; z < N; z += AO_BANDS) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const h = height[i];
      let hidden = 0;
      for (let k = 0; k < AO_DIRECTIONS; k++) {
        let best = 0;
        for (let j = k * AO_STEPS.length; j < (k + 1) * AO_STEPS.length; j++) {
          const sx = x + aoDx[j];
          const sz = z + aoDz[j];
          if (sx < 0 || sz < 0 || sx >= N || sz >= N) break;
          const slope = (height[sz * N + sx] - h) / (aoDistance[j] * cellSize);
          if (slope > best) best = slope;
        }
        hidden += best / Math.sqrt(1 + best * best); // sine of the horizon's angle
      }
      occlusion[i] = 1 - hidden / AO_DIRECTIONS;
    }
  }
  aoBand = (aoBand + 1) % AO_BANDS;
}

/** Fill a frame from the current state. Assumes route() has run since the last change. */
function fillFrame(f) {
  const {N, cellSize, height, area, rain, discharge, soil, dikes, original} =
    sim;
  let peak = -Infinity;
  updateOcclusion();
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
      f.fields[i * 4 + 3] = occlusion[i];

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
      f.normal[i * 4 + 3] = coralShown[i];
      f.ground[i * 4] = original[i] + LAYER_THICKNESS * sim.layerPhase[i];
      f.ground[i * 4 + 1] = dikes[i];
      f.ground[i * 4 + 2] = soil[i];

      // Lakes are flat sheets at their spill height, reaching one point past the shore so the
      // ground cuts a clean shoreline through them. Everywhere else the sheet tucks well under
      // the ground.
      let level = lakeShown[i] > 0.5 ? lakeLevel[i] : -Infinity;
      if (level === -Infinity) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx2 = x + dx;
            const nz2 = z + dz;
            if (nx2 < 0 || nz2 < 0 || nx2 >= N || nz2 >= N) continue;
            const j = nz2 * N + nx2;
            if (lakeShown[j] > 0.5) level = Math.max(level, lakeLevel[j]);
          }
        }
      }
      f.waterY[i] = level > -Infinity ? level : h - 40; // below the GPU's finer relief too
    }
  }
  f.receiver.set(sim.receiver);
  f.cloud.set(sim.cloud);
  f.time = sim.time;
  f.peak = peak;
  f.seaLevel = params.seaLevel;
}

const RIVER_MIN_FLOW = 0.02 * 3.156e7; // m³/yr, about 20 liters a second
const RIVER_TEXELS = 4; // river texture texels per grid cell, each way
const RIVER_REACH = 63; // m: how far from a river the texture keeps track of it

let riversDrawnAt = -Infinity;
/** @type {Float32Array} */
let riverDistance;
/** @type {Float32Array} */
let riverHalfWidth;

/**
 * A texture four times finer than the grid that says, at each texel, how far it is to the
 * nearest river and how wide that river is, so the terrain shader can cut smooth channels and
 * draw banks, gravel bars and green strips along them; plus how much of it is lake. Each river
 * is traced from its head down to where it joins a bigger one or reaches still water, and the
 * grid's zigzags are rounded off with Chaikin's corner cutting.
 * Channels: distance (m, /63), half width (m, /31.5), lake (0..1), unused.
 */
function drawRivers(out) {
  const {N, cellSize, height, wet, discharge, receiver} = sim;
  const num = N * N;
  const M = (N - 1) * RIVER_TEXELS + 1;
  const {seaLevel} = params;
  hasRiverDonor.fill(0);
  visited.fill(0);
  riverDistance.fill(RIVER_REACH);
  riverHalfWidth.fill(1);
  for (let i = 0; i < num; i++) {
    isRiver[i] = +(
      !wet[i] &&
      height[i] >= seaLevel &&
      discharge[i] >= RIVER_MIN_FLOW &&
      receiver[i] !== i
    );
  }
  for (let i = 0; i < num; i++) if (isRiver[i]) hasRiverDonor[receiver[i]] = 1;

  /** Mark texels near the stretch from a to b, given as [grid x, grid z, half width in m]. */
  const stroke = ([ax, az, ah], [bx, bz, bh]) => {
    const reach = Math.min(RIVER_REACH, 8 + 6 * Math.max(ah, bh)) / cellSize;
    const x0 = Math.max(
      0,
      Math.floor((Math.min(ax, bx) - reach) * RIVER_TEXELS),
    );
    const x1 = Math.min(
      M - 1,
      Math.ceil((Math.max(ax, bx) + reach) * RIVER_TEXELS),
    );
    const z0 = Math.max(
      0,
      Math.floor((Math.min(az, bz) - reach) * RIVER_TEXELS),
    );
    const z1 = Math.min(
      M - 1,
      Math.ceil((Math.max(az, bz) + reach) * RIVER_TEXELS),
    );
    const dx = bx - ax;
    const dz = bz - az;
    const length2 = dx * dx + dz * dz || 1e-9;
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        const px = tx / RIVER_TEXELS - ax;
        const pz = tz / RIVER_TEXELS - az;
        const t = Math.min(1, Math.max(0, (px * dx + pz * dz) / length2));
        const d = Math.hypot(px - t * dx, pz - t * dz) * cellSize;
        const half = ah + (bh - ah) * t;
        const k = tz * M + tx;
        // keep whichever river's edge is nearest
        if (d - half < riverDistance[k] - riverHalfWidth[k]) {
          riverDistance[k] = d;
          riverHalfWidth[k] = half;
        }
      }
    }
  };

  for (let head = 0; head < num; head++) {
    if (!isRiver[head] || hasRiverDonor[head]) continue;
    // Width in meters is 5 √Q, Q in m³/s (Leopold and Maddock's hydraulic geometry), at least
    // 2 m.
    let points = [];
    let i = head;
    for (;;) {
      const half = Math.max(1, 2.5 * Math.sqrt(discharge[i] / 3.156e7));
      points.push([i % N, Math.floor(i / N), Math.min(30, half)]);
      if (!isRiver[i] || visited[i]) break;
      visited[i] = 1;
      i = receiver[i];
    }
    if (points.length < 2) continue;
    for (let pass = 0; pass < 3; pass++) {
      const next = [points[0]];
      for (let k = 0; k < points.length - 1; k++) {
        const [a, b] = [points[k], points[k + 1]];
        const lerp = (t) => a.map((v, j) => v + (b[j] - v) * t);
        next.push(lerp(0.25), lerp(0.75));
      }
      next.push(points[points.length - 1]);
      points = next;
    }
    for (let k = 0; k < points.length - 1; k++)
      stroke(points[k], points[k + 1]);
  }

  for (let tz = 0; tz < M; tz++) {
    for (let tx = 0; tx < M; tx++) {
      const k = tz * M + tx;
      // how much of this texel is lake, from the four grid points around it
      const gx = Math.min(tx / RIVER_TEXELS, N - 1.001);
      const gz = Math.min(tz / RIVER_TEXELS, N - 1.001);
      const x = Math.floor(gx);
      const z = Math.floor(gz);
      const fx = gx - x;
      const fz = gz - z;
      const j = z * N + x;
      const lake = (w) => lakeShown[w];
      const lakeness =
        (lake(j) * (1 - fx) + lake(j + 1) * fx) * (1 - fz) +
        (lake(j + N) * (1 - fx) + lake(j + N + 1) * fx) * fz;
      out[k * 4] = (riverDistance[k] / RIVER_REACH) * 255;
      out[k * 4 + 1] = (riverHalfWidth[k] / 31.5) * 255;
      out[k * 4 + 2] = lakeness * 255;
      out[k * 4 + 3] = 255;
    }
  }
}

function send() {
  if (!dirty || !freeFrames.length) return;
  const f = freeFrames.pop();
  fillFrame(f);
  dirty = false;
  // Rivers move slowly, and the texture is big, so redraw it at most twice a second.
  const now = performance.now();
  f.riversFresh = now - riversDrawnAt > 500;
  if (f.riversFresh) {
    drawRivers(f.rivers);
    riversDrawnAt = now;
  }
  postMessage({type: 'frame', frame: f}, [
    f.rivers.buffer,
    f.fields.buffer,
    f.height.buffer,
    f.normal.buffer,
    f.ground.buffer,
    f.waterY.buffer,
    f.area.buffer,
    f.rain.buffer,
    f.cloud.buffer,
    f.flow.buffer,
    f.receiver.buffer,
  ]);
}

/** Ease lakes and reefs as drawn toward the model's (ease 1 snaps). */
function updateShown(ease) {
  const {wet, water, coral} = sim;
  for (let i = 0; i < lakeShown.length; i++) {
    const isLake = wet[i] === 1;
    if (isLake) lakeLevel[i] = water[i];
    lakeShown[i] += (+isLake - lakeShown[i]) * ease;
    coralShown[i] += (coral[i] - coralShown[i]) * ease;
  }
}

function tick() {
  const now = performance.now();
  yearsDue = Math.min(
    yearsDue + ((now - lastTick) / 1000) * speed,
    STEP_YEARS * 20,
  );
  lastTick = now;
  while (yearsDue >= STEP_YEARS && performance.now() - now < BUDGET_MS) {
    setSeaLevel();
    sim.step(STEP_YEARS, params);
    updateShown(SHOWN_EASE);
    yearsDue -= STEP_YEARS;
    dirty = true;
  }
  if (performance.now() - now >= BUDGET_MS) yearsDue = 0; // can't keep up: go as fast as we can
  // Each step routes the water before it erodes, so the frame shows that routing, one step
  // behind the heights. Routing again just to draw took 40% of the worker's time.
  send();
  setTimeout(tick, yearsDue >= STEP_YEARS ? 0 : 8);
}

function setSeaLevel() {
  params.seaLevel = baseSeaLevel + (iceAges ? iceAgeSeaLevel(sim.time) : 0);
}

onmessage = ({data}) => {
  if (data.type === 'init') {
    sim = makeSim({N: data.N, cellSize: data.cellSize, seed: data.seed});
    freeFrames.length = 0;
    freeFrames.push(makeFrame(), makeFrame());
    isRiver = new Uint8Array(data.N * data.N);
    visited = new Uint8Array(data.N * data.N);
    hasRiverDonor = new Uint8Array(data.N * data.N);
    riversDrawnAt = -Infinity;
    occlusion = new Float32Array(data.N * data.N);
    for (let k = 0; k < AO_BANDS; k++) updateOcclusion();
    const texels = ((data.N - 1) * RIVER_TEXELS + 1) ** 2;
    riverDistance = new Float32Array(texels);
    riverHalfWidth = new Float32Array(texels);
    sim.route(params);
    lakeShown = new Float32Array(data.N * data.N);
    lakeLevel = new Float32Array(data.N * data.N);
    coralShown = new Float32Array(data.N * data.N);
    updateShown(1);
    dirty = true;
    yearsDue = 0;
    if (!data.restart) tick();
  } else if (data.type === 'params') {
    const {iceAges: cycles, ...rest} = data.params;
    params = {...params, ...rest};
    baseSeaLevel = rest.seaLevel;
    iceAges = cycles;
    setSeaLevel();
    speed = data.speed;
    sim.route(params);
    dirty = true;
  } else if (data.type === 'brush') {
    sim.brush(data.x, data.z, data.radius, data.amount);
    sim.route(params);
    updateShown(1); // a dam the reader just built fills at once
    dirty = true;
  } else if (data.type === 'frame') {
    if (data.frame.height.length === sim.N * sim.N) freeFrames.push(data.frame);
  }
};
