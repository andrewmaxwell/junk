// Landscape evolution: the crust rises, rivers cut down and drop part of what they carry, and
// slopes creep, following
//   dh/dt = U − K Q^m · S + G Qs / A + D ∇²h
// U is uplift, Q is river discharge (the rain falling on everything upstream of a point), S is
// the slope to the next point downstream, Qs is the sediment the river carries, A the area
// draining through and D is how fast soil creeps downhill. River incision and deposition are
// solved implicitly along the drainage tree (Braun & Willett 2013, Yuan et al. 2019), so they
// are stable at any time step. Depressions fill with lakes that drain over their lowest rim (priority flood,
// Barnes 2014). The sea is the base level: rivers end there and can't cut below it.
// What rivers cut away is carried downstream and settles where they reach still water, filling
// lakes and building deltas. Rain is heavier where the wind climbs a slope and lighter in the
// lee, and moist air dries out as it rains crossing the island, which leaves a rain shadow.
// It cools 6.5 °C per km of height. Plants and soil return part of the rain to the air (the
// Budyko curve), so only the rest runs off into rivers, and hot, dry places lose almost all of
// it on average. But desert rain comes in storms that run straight off bare ground, so up to
// 30% of it still reaches the rivers in flash floods. Plant cover follows how wet and warm a
// place is, and roots hold the soil: bare ground erodes e² ≈ 7 times faster than full cover.
// The island is a chain of basalt volcanoes. Young lava is so full of cracks that rain soaks
// straight in; lava flows alternate with soft beds of ash and rubble, and dikes are hard. Waves
// cut the coast back into cliffs, fastest where they arrive across deep water.

import {makeIsland, makeRandom, makeFractalNoise} from './terrain.js';

export const defaults = {
  rain: 2.5, // m/yr of rain, averaged over the land
  temperature: 24, // °C at sea level
  wind: 60, // degrees the wind blows from: 0 north (away from the camera), 90 east
  upliftRate: 1.5, // mm/yr at the fastest-rising point
  seaLevel: 0, // m
  K: 1.2e-4, // erodibility of bare ground, for discharge in m³/yr
  m: 0.5, // discharge exponent (slope exponent n is 1)
  D: 0.03, // m²/yr soil creep on land
  marineD: 0.4, // m²/yr sediment spreading under water, which builds a shelf
  G: 1, // how readily rivers drop what they carry (Yuan et al. 2019's G)
  layering: 1, // how much harder lava flows are than the ash beds between them (0 for none)
  waveErosion: 0.01, // m/yr a basalt sea cliff retreats in the full force of the waves
  criticalSlope: 1.1, // the steepest rock stands (about 48°) before it slides
  reefGrowth: 0.008, // m/yr, the fastest a coral reef builds upward, in shallow, clear water
};

const neighborOffsets = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** m: how far condensed water drifts before most of it has fallen (1/e) */
const RAIN_DRIFT = 1000;

// Coral reefs build up toward sea level where the sea is warm and shallow enough for light,
// clear of river mud, and flushed by the open ocean. Growth falls off with depth as light
// does (Bosscher & Schlager 1992: G = Gmax tanh(I0 e^(−kz) / Ik)), so reefs grow down to
// about 50 m.
const REEF_LIGHT_FALLOFF = 0.08; // per m of depth
const REEF_SURFACE_LIGHT = 20; // surface light over what corals need to grow at full speed
/** m: reef growth falls off by 1/e this far from the deep, open ocean */
const REEF_FLUSHING = 400;
/** m of depth that counts as open ocean */
const OPEN_OCEAN_DEPTH = 60;
/** m/yr of mud settling that cuts reef growth by 1/e (about 10 mg/cm² a day, the usual limit) */
const REEF_MUD_LIMIT = 0.005;
/** m: how far a river's muddy plume spreads around where it settles */
const MUD_SPREAD = 300;

// Storms break coral off a reef's edge and throw it up onto the flat behind it, building low
// islands of rubble and sand (motus), most on the side the wind and waves come from. Where they
// pile up is patchy, which leaves passes between them.
/** m above the sea that storm waves can pile rubble */
const MOTU_HEIGHT = 3;
/** m/yr rubble builds up behind a fully living reef edge, on the windward side */
const RUBBLE_RATE = 0.003;
/** m: how far behind the reef's edge rubble is thrown */
const RUBBLE_REACH = 250;

/** steps between rain sweeps while time runs */
const RAIN_EVERY = 5;

/** how many times more easily loose sediment erodes than average basalt */
const SEDIMENT_SOFTNESS = 2;
/** m of sediment that counts as covering the rock */
const COVERED = 0.5;
/** m: one lava flow plus the bed of ash and rubble on top of it */
const LAYER_THICKNESS = 40;
/** years for weathering to clog young lava's cracks so rain runs off instead of soaking in */
const SEAL_TIME = 150e3;
/** the steepest loose sediment lies, its angle of repose (about 33°) */
const REPOSE_SLOPE = 0.65;
/** m of sediment that slides at its own angle; a thin skin rests on the rock's (switching at
 * COVERED made slides flip points back and forth into a checkerboard) */
const DEEP_DEBRIS = 5;
/** m below sea level waves cut the shore down to */
const WAVE_BASE = 2;
/** m of fetch over deep water for waves to build to full size */
const FETCH = 3000;
/** m of shallow water over which waves lose most of their energy */
const SHOAL_LOSS = 200;

/**
 * Sea level offset (m) at year t from the ice ages' 100,000-year cycle: ice sheets grow slowly,
 * with wobbles from the 23,000-year precession cycle, drawing the sea down 120 m, then melt in
 * about 12,000 years. Year 0 is a warm high stand like today.
 * @param {number} t
 */
export function iceAgeSeaLevel(t) {
  const phase = (t / 100e3) % 1;
  if (phase > 0.88) return -120 * (1 - (phase - 0.88) / 0.12);
  const x = phase / 0.88;
  return Math.max(
    -125,
    Math.min(
      0,
      -120 * x ** 0.8 +
        18 * Math.sin((t / 23e3) * Math.PI * 2) * Math.sin(x * Math.PI),
    ),
  );
}

/** m/yr the air could take up from a well-watered surface at t °C (a rough Hamon-style fit). */
export const potentialEvaporation = (t) => Math.max(0, 0.065 * t);

/**
 * m/yr returned to the air out of `rain`, by Budyko's curve: with plenty of rain it approaches
 * the potential, and in a desert it approaches all of the rain.
 * @param {number} rain
 * @param {number} potential
 */
export function evaporation(rain, potential) {
  if (rain <= 0 || potential <= 0) return 0;
  const phi = potential / rain;
  const fraction = Math.sqrt(phi * Math.tanh(1 / phi) * (1 - Math.exp(-phi)));
  return Math.min(rain, potential, rain * fraction);
}

/**
 * Plant cover from 0 to 1. It needs rain to match at least most of what the air would take
 * (aridity below 0.15 is desert), and warmth to grow (none below freezing).
 * @param {number} rain m/yr
 * @param {number} t °C
 */
export function plantCover(rain, t) {
  const potential = potentialEvaporation(t);
  const aridity = potential > 0 ? rain / potential : Infinity;
  return smooth(0.15, 0.85, aridity) * smooth(-3, 6, t);
}

/**
 * What grows somewhere, by warmth and by how its rain compares with what the air could take
 * (roughly Whittaker's biomes, with UNEP's aridity bands).
 * @param {number} rain m/yr
 * @param {number} t °C
 */
export function biome(rain, t) {
  if (t < -2) return 'ice and snow';
  if (t < 3) return 'tundra';
  const aridity = rain / potentialEvaporation(t);
  if (aridity < 0.2) return 'desert';
  if (aridity < 0.5) return 'dry scrub';
  if (aridity < 0.8) return t > 18 ? 'savanna' : 'grassland';
  if (t > 18) return 'rainforest';
  return t > 8 ? 'forest' : 'conifer forest';
}

/** 0 at a, 1 at b, smooth between */
export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * @param {{N: number, cellSize: number, seed: number}} options
 */
export function makeSim({N, cellSize, seed}) {
  const num = N * N;
  const height = new Float64Array(num);
  const uplift = new Float32Array(num); // 0..1, times upliftRate
  const water = new Float64Array(num); // height of the lake or sea surface, or the land if dry
  const wet = new Uint8Array(num); // 1 for lakes, 2 for the sea
  const receiver = new Int32Array(num); // where each point drains to
  const receiverDistance = new Float32Array(num);
  const area = new Float64Array(num); // m² draining through each point
  const rain = new Float32Array(num); // m/yr falling on each point
  const discharge = new Float64Array(num); // m³/yr flowing through each point
  const runoff = new Float32Array(num); // m/yr of rain that isn't evaporated or used by plants
  const cover = new Float32Array(num); // 0 bare to 1 full plant cover
  const erodibility = new Float32Array(num); // K, lowered by plant cover, varied by the rock
  const plantK = new Float32Array(num); // K lowered by plant cover alone
  const rock = new Float32Array(num); // how easily the ground erodes, over average basalt
  const age = new Float32Array(num); // years since the surface lava erupted, at the start
  const dikes = new Float32Array(num); // 0..1, how much of the rock is hard dikes
  const soil = new Float64Array(num); // m of loose sediment over the rock
  const original = new Float64Array(num); // where the island's first surface is now, m
  const start = new Float64Array(num); // heights before rivers work on them, each step
  const incoming = new Float64Array(num); // m³ arriving from upstream in a step
  const excess = new Float64Array(8); // how much too steep each neighbor is, in a landslide
  const flowPower = new Float64Array(num); // K Q^m dt
  const wave = new Float32Array(num); // 0..1, wave energy, from the wind and open sea
  const upwind = new Int32Array(num); // the point one step upwind, or -1 off the grid
  const moisture = new Float32Array(num); // water vapor, 1 for air fresh off the sea
  const cloud = new Float32Array(num); // condensed water still falling
  const sediment = new Float64Array(num); // m³ carried out of each point this step
  const mud = new Float64Array(num); // m/yr of sediment settling in the sea
  const coral = new Float32Array(num); // 0..1, how fast reef is growing here, over the fastest
  const openDistance = new Float64Array(num); // m to the deep, open ocean
  const smoothGround = new Float64Array(num);
  const blurTemp = new Float64Array(num);
  const stack = new Int32Array(num); // every point after the one it drains to
  const floodReceiver = new Int32Array(num);
  const closed = new Uint8Array(num);
  const change = new Float64Array(num);
  const heapKeys = new Float64Array(num);
  const heapValues = new Int32Array(num);
  const pits = new Int32Array(num);

  const offsets = neighborOffsets.map(([dx, dz]) => dz * N + dx);
  const offsetX = Int8Array.from(neighborOffsets, ([dx]) => dx);
  const distances = neighborOffsets.map(
    ([dx, dz]) => Math.hypot(dx, dz) * cellSize,
  );
  const isEdge = (i) => {
    const x = i % N;
    const z = (i / N) | 0;
    return x === 0 || z === 0 || x === N - 1 || z === N - 1;
  };
  const edge = Uint8Array.from({length: num}, (_, i) => +isEdge(i));
  // 1 except near the grid's edges, which stay put
  const sinking = Float32Array.from({length: num}, (_, i) => {
    const x = i % N;
    const z = (i / N) | 0;
    return smooth(0, 0.08, Math.min(x, z, N - 1 - x, N - 1 - z) / (N - 1));
  });

  makeIsland(N, seed, height, uplift, age, dikes);
  original.set(height);
  const layerNoise = makeFractalNoise(makeRandom(seed + 2));
  // lava flows aren't perfectly even sheets, so the layers wander up and down
  const layerPhase = Float32Array.from({length: num}, (_, i) =>
    layerNoise(((i % N) / N) * 5, (((i / N) | 0) / N) * 5),
  );
  const stormNoise = makeFractalNoise(makeRandom(seed + 1));
  // 0..1, how much of the rubble that storms throw up stays at each point
  const storminess = Float32Array.from({length: num}, (_, i) =>
    smooth(-0.15, 0.25, stormNoise(((i % N) / N) * 6, (((i / N) | 0) / N) * 6)),
  );
  const rubble = new Float64Array(num); // scratch for how much reef is near each point
  let time = 0;
  let lostSediment = 0; // m³ carried off the edge of the grid or out to the deep sea
  let reefVolume = 0; // m³ of reef built
  const cellArea = cellSize * cellSize;

  // a binary min-heap of points keyed by water level
  let heapSize = 0;
  function push(key, value) {
    let k = heapSize++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (heapKeys[parent] <= key) break;
      heapKeys[k] = heapKeys[parent];
      heapValues[k] = heapValues[parent];
      k = parent;
    }
    heapKeys[k] = key;
    heapValues[k] = value;
  }
  function pop() {
    const top = heapValues[0];
    const key = heapKeys[--heapSize];
    const value = heapValues[heapSize];
    let k = 0;
    for (;;) {
      let child = 2 * k + 1;
      if (child >= heapSize) break;
      if (child + 1 < heapSize && heapKeys[child + 1] < heapKeys[child])
        child++;
      if (heapKeys[child] >= key) break;
      heapKeys[k] = heapKeys[child];
      heapValues[k] = heapValues[child];
      k = child;
    }
    heapKeys[k] = key;
    heapValues[k] = value;
    return top;
  }

  /**
   * Box blur over a square of side 2r+1, in place, by running sums along rows then columns.
   * @param {Float64Array} a
   * @param {number} r
   */
  function blur(a, r) {
    for (const [stride, step] of [
      [N, 1],
      [1, N],
    ]) {
      blurTemp.set(a);
      for (let line = 0; line < N; line++) {
        const start = line * stride;
        let sum = 0;
        let count = 0;
        for (let k = 0; k < r && k < N; k++, count++)
          sum += blurTemp[start + k * step];
        for (let k = 0; k < N; k++) {
          if (k + r < N) {
            sum += blurTemp[start + (k + r) * step];
            count++;
          }
          if (k - r - 1 >= 0) {
            sum -= blurTemp[start + (k - r - 1) * step];
            count--;
          }
          a[start + k * step] = sum / count;
        }
      }
    }
  }

  /** °C at point i */
  const temperatureAt = (i, p) =>
    p.temperature - 0.0065 * Math.max(0, height[i] - p.seaLevel);

  /** @type {Int32Array} */
  let windOrder;
  let orderedFor = NaN;

  /**
   * Sweep moist air across the grid with the wind. Rising over a slope wrings rain out of it in
   * proportion to how steeply it climbs; sinking down the far side, it barely rains. Over the
   * sea the air picks moisture back up. Rain is then scaled so the land averages p.rain.
   * @param {typeof defaults} p
   */
  function updateRain(p) {
    const angle = (p.wind * Math.PI) / 180;
    const wx = -Math.sin(angle); // the way the wind blows, in grid steps
    const wz = Math.cos(angle);
    if (orderedFor !== p.wind) {
      const along = Float64Array.from(
        {length: num},
        (_, i) => (i % N) * wx + ((i / N) | 0) * wz,
      );
      windOrder = Int32Array.from({length: num}, (_, i) => i).sort(
        (a, b) => along[a] - along[b],
      );
      for (let i = 0; i < num; i++) {
        const x = Math.round((i % N) - wx * 1.5);
        const z = Math.round(((i / N) | 0) - wz * 1.5);
        upwind[i] = x < 0 || z < 0 || x >= N || z >= N ? -1 : z * N + x;
      }
      orderedFor = p.wind;
    }
    // Looking 1.5 cells upwind, all four points around the sample are already done.
    const back = 1.5;
    // Air rises over the broad shape of the land, not over every gully, so lift comes from the
    // ground smoothed over about a kilometer.
    for (let i = 0; i < num; i++)
      smoothGround[i] = Math.max(height[i], p.seaLevel);
    blur(smoothGround, Math.max(1, Math.round(500 / cellSize)));
    const ground = (i) => smoothGround[i];
    let landRain = 0;
    let landCount = 0;
    for (let k = 0; k < num; k++) {
      const i = windOrder[k];
      const ux = (i % N) - wx * back;
      const uz = ((i / N) | 0) - wz * back;
      let m = 1;
      let c = 0;
      let upwind = ground(i);
      if (ux >= 0 && uz >= 0 && ux < N - 1 && uz < N - 1) {
        const x0 = Math.floor(ux);
        const z0 = Math.floor(uz);
        const fx = ux - x0;
        const fz = uz - z0;
        const j = z0 * N + x0;
        const [w00, w10, w01, w11] = [
          (1 - fx) * (1 - fz),
          fx * (1 - fz),
          (1 - fx) * fz,
          fx * fz,
        ];
        m =
          moisture[j] * w00 +
          moisture[j + 1] * w10 +
          moisture[j + N] * w01 +
          moisture[j + N + 1] * w11;
        c =
          cloud[j] * w00 +
          cloud[j + 1] * w10 +
          cloud[j + N] * w01 +
          cloud[j + N + 1] * w11;
        upwind =
          ground(j) * w00 +
          ground(j + 1) * w10 +
          ground(j + N) * w01 +
          ground(j + N + 1) * w11;
      }
      const climb = (ground(i) - upwind) / (back * cellSize);
      const strength = Math.min(4, Math.max(0, 0.3 + 16 * climb));
      // Rising air condenses vapor into cloud, and the cloud rains out over a few kilometers
      // as it drifts on, so rain spills past a ridge instead of stopping at its crest.
      const condensed = m * (1 - Math.exp((-strength * cellSize) / 8000));
      m -= condensed;
      c += condensed;
      const fall = c * (1 - Math.exp((-back * cellSize) / RAIN_DRIFT));
      cloud[i] = c - fall;
      if (height[i] < p.seaLevel) {
        moisture[i] = Math.min(1, m + cellSize / 5000);
        rain[i] = (fall * 8000) / cellSize;
      } else {
        // a floor of showers that don't depend on the wind, so the lee is dry, not a desert
        rain[i] = 0.15 + (fall * 8000) / cellSize;
        moisture[i] = m;
        landRain += rain[i];
        landCount++;
      }
    }
    const scale = landCount ? (p.rain * landCount) / landRain : p.rain;
    for (let i = 0; i < num; i++) {
      rain[i] *= scale;
      const t = temperatureAt(i, p);
      const potential = potentialEvaporation(t);
      const lost = evaporation(rain[i], potential);
      cover[i] = plantCover(rain[i], t);
      // young lava soaks up the rain until weathering clogs its cracks
      const sealed = 1 - 0.9 * Math.exp(-(age[i] + time) / SEAL_TIME);
      runoff[i] =
        Math.max(rain[i] - lost, rain[i] * 0.3 * (1 - cover[i])) * sealed;
      plantK[i] = p.K * Math.exp(-2 * cover[i]);
    }
  }

  let stepsSinceRain = Infinity;

  /**
   * Work out the rain, fill lakes and the sea from the edges inward, record the order points
   * were reached (which never decreases in water level) and work out where each point drains.
   * @param {typeof defaults} p
   * @param {boolean} [freshRain] false to keep the rain from up to RAIN_EVERY steps ago
   */
  function route(p, freshRain = true) {
    const {seaLevel} = p;
    if (freshRain || stepsSinceRain >= RAIN_EVERY) {
      updateRain(p);
      stepsSinceRain = 0;
    }
    closed.fill(0);
    heapSize = 0;
    for (let i = 0; i < num; i++) {
      if (!edge[i]) continue;
      water[i] = Math.max(height[i], seaLevel);
      floodReceiver[i] = i;
      closed[i] = 1;
      push(water[i], i);
    }
    let pitStart = 0;
    let pitEnd = 0;
    let count = 0;
    while (heapSize > 0 || pitEnd > pitStart) {
      const c = pitEnd > pitStart ? pits[pitStart++] : pop();
      stack[count++] = c;
      const x = c % N;
      for (let k = 0; k < 8; k++) {
        const nx = x + neighborOffsets[k][0];
        if (nx < 0 || nx >= N) continue;
        const n = c + offsets[k];
        if (n < 0 || n >= num || closed[n]) continue;
        closed[n] = 1;
        floodReceiver[n] = c;
        if (height[n] <= water[c]) {
          water[n] = water[c];
          pits[pitEnd++] = n;
        } else {
          water[n] = height[n];
          push(water[n], n);
        }
      }
      if (pitStart === pitEnd) pitStart = pitEnd = 0;
    }

    // Dry land drains down its steepest drop in water level, so lakes and the sea
    // look flat. Lakes and flats drain toward wherever the flood reached them from.
    for (let i = 0; i < num; i++) {
      wet[i] = height[i] < water[i] ? (water[i] <= seaLevel ? 2 : 1) : 0;
      receiver[i] = i;
      receiverDistance[i] = cellSize;
      if (edge[i] || wet[i] === 2) continue;
      if (!wet[i]) {
        const x = i % N;
        let best = 0;
        for (let k = 0; k < 8; k++) {
          const n = i + offsets[k];
          const drop = (water[i] - water[n]) / distances[k];
          if (drop > best && Math.abs((n % N) - x) <= 1) {
            best = drop;
            receiver[i] = n;
            receiverDistance[i] = distances[k];
          }
        }
        if (receiver[i] !== i) continue;
      }
      const r = floodReceiver[i];
      receiver[i] = r;
      receiverDistance[i] =
        Math.hypot((r % N) - (i % N), ((r / N) | 0) - ((i / N) | 0)) * cellSize;
    }

    // How easily each point erodes: loose sediment easily, dikes hardly, and lava flows less
    // easily than the ash and rubble beds between them, which come and go as rivers cut down.
    for (let i = 0; i < num; i++) {
      if (soil[i] > COVERED) {
        rock[i] = SEDIMENT_SOFTNESS;
      } else {
        const depth = original[i] - height[i] + soil[i];
        const bed = depth / LAYER_THICKNESS + layerPhase[i];
        const ash = smooth(0.6, 0.75, bed - Math.floor(bed));
        rock[i] = (1 + p.layering * (2.4 * ash - 0.55)) * (1 - 0.8 * dikes[i]);
      }
      erodibility[i] = plantK[i] * rock[i];
    }

    area.fill(cellArea);
    for (let i = 0; i < num; i++) discharge[i] = runoff[i] * cellArea;
    for (let k = num - 1; k >= 0; k--) {
      const i = stack[k];
      if (receiver[i] === i) continue;
      area[receiver[i]] += area[i];
      discharge[receiver[i]] += discharge[i];
    }
  }

  /**
   * Advance by dt years.
   * @param {number} dt
   * @param {typeof defaults} p
   */
  function step(dt, p) {
    const {seaLevel} = p;
    const upliftRate = p.upliftRate / 1000;
    // Rising is local, where the crust is pushed up, but sinking is the whole plate cooling as
    // it moves away from where the island formed, so it's even across the grid.
    for (let i = 0; i < num; i++) {
      const rise = (upliftRate > 0 ? uplift[i] : sinking[i]) * upliftRate * dt;
      height[i] += rise;
      original[i] += rise;
    }

    // The climate follows the broad shape of the land, which barely moves in one step, and the
    // rain sweep is a third of the step's time, so it's only redone every few steps.
    stepsSinceRain++;
    route(p, false);

    // Rivers cut toward the point they drain to, upstream from the sea, and drop part of what
    // they carry: G Qs / A, so a river leaving steep ground for gentle ground builds a fan, and
    // one nearing the sea a floodplain. Streams that reach a lake or the sea cut down to its
    // surface, not its floor. Lake beds don't erode. What each point receives depends on what
    // the points above it cut, which are solved after it, so this goes back and forth a few
    // times (Gauss-Seidel, as Yuan et al. do), starting from what arrived last step.
    start.set(height);
    for (let i = 0; i < num; i++)
      flowPower[i] = erodibility[i] * dt * Math.pow(discharge[i], p.m);
    for (let pass = 0; pass < (p.G > 0 ? 3 : 1); pass++) {
      for (let k = 0; k < num; k++) {
        const i = stack[k];
        const r = receiver[i];
        if (r === i || wet[i]) continue;
        const base = wet[r] ? water[r] : height[r];
        const beta = (p.G * cellArea) / area[i];
        const f = flowPower[i] / receiverDistance[i] / (1 + beta);
        const dropped = (beta * incoming[i]) / cellArea / (1 + beta);
        height[i] = Math.min(
          (start[i] + f * base + dropped) / (1 + f),
          start[i] + incoming[i] / cellArea,
        );
      }
      if (p.G <= 0) break;
      incoming.fill(0);
      for (let k = num - 1; k >= 0; k--) {
        const i = stack[k];
        const r = receiver[i];
        if (r === i || wet[i]) continue;
        incoming[r] += Math.max(
          0,
          incoming[i] + (start[i] - height[i]) * cellArea,
        );
      }
    }

    // Carry it downstream. Rivers drop what the solve above says, never more than reaches
    // them. In still water it all settles: lakes fill up to their surface from where rivers
    // enter, then pass the rest on toward their outlet. At the sea it fills to a meter below sea
    // level and slides on down the steepest slope, so deltas build out from river mouths.
    sediment.fill(0); // m³ arriving at each point from upstream
    mud.fill(0);
    for (let k = num - 1; k >= 0; k--) {
      const i = stack[k];
      let q = sediment[i];
      if (wet[i] === 2) {
        if (q > 0) settleInSea(i, q, seaLevel - 1, dt);
        continue;
      }
      if (wet[i]) {
        const settled = Math.min(
          q,
          Math.max(0, water[i] - height[i]) * cellArea,
        );
        height[i] += settled / cellArea;
        soil[i] += settled / cellArea;
        q -= settled;
      } else {
        height[i] = Math.min(height[i], start[i] + q / cellArea);
        const change = height[i] - start[i];
        q -= change * cellArea;
        soil[i] = Math.max(0, soil[i] + change);
      }
      if (receiver[i] === i) lostSediment += q;
      else sediment[receiver[i]] += q;
    }
    if (p.G > 0) incoming.set(sediment);

    measureOpenSea(seaLevel);
    cutCoast(dt, p);
    growReefs(dt, p);

    // Soil creep, faster under water. Explicit, in as many substeps as stability needs.
    const fastest = Math.max(p.D, p.marineD);
    const substeps = Math.ceil((fastest * dt) / (cellSize * cellSize) / 0.2);
    const h = dt / substeps / (cellSize * cellSize);
    for (let s = 0; s < substeps; s++) {
      change.fill(0);
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++) {
          const i = z * N + x;
          const Di = height[i] < seaLevel ? p.marineD * (1 - coral[i]) : p.D;
          if (x < N - 1) {
            const j = i + 1;
            const Dj = height[j] < seaLevel ? p.marineD * (1 - coral[j]) : p.D;
            const flow = ((Di + Dj) / 2) * (height[i] - height[j]) * h;
            change[i] -= flow;
            change[j] += flow;
          }
          if (z < N - 1) {
            const j = i + N;
            const Dj = height[j] < seaLevel ? p.marineD * (1 - coral[j]) : p.D;
            const flow = ((Di + Dj) / 2) * (height[i] - height[j]) * h;
            change[i] -= flow;
            change[j] += flow;
          }
        }
      }
      for (let i = 0; i < num; i++) {
        if (edge[i]) continue;
        height[i] += change[i];
        soil[i] = Math.max(0, soil[i] + change[i]);
      }
    }

    slide(p);
    time += dt;
  }

  /**
   * Landslides: wherever ground stands steeper than it can hold (rock up to criticalSlope,
   * deep sediment only to its angle of repose), the excess slides to the lowest neighbor and
   * stays there as loose debris. Going from the highest water levels down lets a slide's
   * debris set off the next one below it in the same step.
   * @param {typeof defaults} p
   */
  function slide(p) {
    if (!(p.criticalSlope > 0)) return;
    // The sea floor is in flood order, not height order, so slides there don't chain within a
    // pass; a second pass in plain grid order (quicker: it reads memory in order) catches most
    // of what the first left.
    slidePass(p, true);
    slidePass(p, false);
  }

  /**
   * @param {typeof defaults} p
   * @param {boolean} downhill in flood order from the top, or else in grid order
   */
  function slidePass(p, downhill) {
    for (let k = num - 1; k >= 0; k--) {
      const i = downhill ? stack[k] : k;
      if (edge[i]) continue;
      const critical = soil[i] > DEEP_DEBRIS ? REPOSE_SLOPE : p.criticalSlope;
      const x = i % N;
      let most = 0;
      let total = 0;
      const h = height[i];
      for (let d = 0; d < 8; d++) {
        const nx = x + offsetX[d];
        const e = h - height[i + offsets[d]] - critical * distances[d];
        excess[d] = nx >= 0 && nx < N && e > 0 ? e : 0;
        most = Math.max(most, excess[d]);
        total += excess[d];
      }
      if (most <= 0) continue;
      // half the worst excess, shared among every neighbor it's too steep toward (sending it
      // all down the steepest one left a checkerboard)
      const moved = most / 2;
      height[i] -= moved;
      soil[i] = Math.max(0, soil[i] - moved);
      for (let d = 0; d < 8; d++) {
        if (!excess[d]) continue;
        const n = i + offsets[d];
        height[n] += (moved * excess[d]) / total;
        soil[n] += (moved * excess[d]) / total;
      }
    }
  }

  /**
   * Grow coral reefs for dt years. Reef is rock, so living reef doesn't creep (see the soil
   * creep loop) and isn't counted as sediment.
   * @param {number} dt
   * @param {typeof defaults} p
   */
  function growReefs(dt, p) {
    const {seaLevel} = p;
    const warmth = smooth(17, 22, p.temperature);
    coral.fill(0);
    if (!warmth || p.reefGrowth <= 0) return;
    blur(mud, Math.max(1, Math.round(MUD_SPREAD / cellSize)));
    for (let i = 0; i < num; i++) {
      const depth = seaLevel - 1 - height[i];
      // below 100 m there's under 1% of the light reefs need
      if (depth <= 0 || depth > 100 || wet[i] !== 2) continue;
      const rate =
        warmth *
        Math.tanh(REEF_SURFACE_LIGHT * Math.exp(-REEF_LIGHT_FALLOFF * depth)) *
        Math.exp(-openDistance[i] / REEF_FLUSHING - mud[i] / REEF_MUD_LIMIT);
      coral[i] = rate;
      const grown = Math.min(depth, rate * p.reefGrowth * dt);
      height[i] += grown;
      original[i] += grown; // reef rock is a fresh surface
      reefVolume += grown * cellArea;
    }

    // motus: rubble from the reef's edge thrown up onto the flat, highest to windward
    rubble.set(coral);
    blur(rubble, Math.max(1, Math.round(RUBBLE_REACH / cellSize)));
    const angle = (p.wind * Math.PI) / 180;
    const upwind = Math.round(600 / cellSize);
    const ux = Math.round(Math.sin(angle) * upwind); // toward where the wind comes from
    const uz = Math.round(-Math.cos(angle) * upwind);
    for (let i = 0; i < num; i++) {
      const top = seaLevel + MOTU_HEIGHT;
      if (wet[i] === 1 || height[i] < seaLevel - 1.5 || height[i] >= top)
        continue;
      const x = (i % N) + ux;
      const z = ((i / N) | 0) + uz;
      const windward =
        x < 0 || z < 0 || x >= N || z >= N || openDistance[z * N + x] === 0
          ? 1
          : 0.5;
      const grown = Math.min(
        top - height[i],
        RUBBLE_RATE * rubble[i] * windward * storminess[i] * dt,
      );
      height[i] += grown;
      soil[i] += grown;
      reefVolume += grown * cellArea;
    }
  }

  /**
   * Distance to the deep, open ocean, by two chamfer passes over the grid (its edges are open
   * ocean).
   * @param {number} seaLevel
   */
  function measureOpenSea(seaLevel) {
    for (let i = 0; i < num; i++)
      openDistance[i] =
        height[i] < seaLevel - OPEN_OCEAN_DEPTH || edge[i] ? 0 : Infinity;
    const diagonal = Math.SQRT2 * cellSize;
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const i = z * N + x;
        openDistance[i] = Math.min(
          openDistance[i],
          openDistance[i - 1] + cellSize,
          openDistance[i - N] + cellSize,
          openDistance[i - N - 1] + diagonal,
          openDistance[i - N + 1] + diagonal,
        );
      }
    }
    for (let z = N - 2; z > 0; z--) {
      for (let x = N - 2; x > 0; x--) {
        const i = z * N + x;
        openDistance[i] = Math.min(
          openDistance[i],
          openDistance[i + 1] + cellSize,
          openDistance[i + N] + cellSize,
          openDistance[i + N + 1] + diagonal,
          openDistance[i + N - 1] + diagonal,
        );
      }
    }
  }

  /**
   * Waves cut the shore back into cliffs, down to a platform a little under the sea. They build
   * up crossing deep water downwind and lose their energy crossing shallows, so a wide reef flat
   * or shelf shelters the coast behind it; a smaller swell comes in from every side of the open
   * ocean. Loose sediment goes faster than basalt, and dikes hold out as headlands.
   * @param {number} dt
   * @param {typeof defaults} p
   */
  function cutCoast(dt, p) {
    const {seaLevel} = p;
    if (p.waveErosion <= 0 || !windOrder) return;
    const travel = 1.5 * cellSize;
    for (let k = 0; k < num; k++) {
      const i = windOrder[k];
      const depth = seaLevel - height[i];
      if (depth <= 0) {
        wave[i] = 0;
        continue;
      }
      const from = upwind[i] < 0 ? 1 : wave[upwind[i]];
      let w = from + (1 - from) * Math.min(1, travel / FETCH);
      if (depth < 10) w *= Math.exp((-travel / SHOAL_LOSS) * (1 - depth / 10));
      wave[i] = w;
    }
    const target = seaLevel - WAVE_BASE;
    change.fill(0); // m³ of rubble falling into each point of the sea
    for (let z = 1; z < N - 1; z++) {
      for (let x = 1; x < N - 1; x++) {
        const i = z * N + x;
        if (wet[i] || height[i] <= seaLevel) continue;
        let energy = 0;
        let toward = -1;
        for (let k = 0; k < 4; k++) {
          const n = i + offsets[k];
          if (wet[n] !== 2) continue;
          const e = 0.7 * wave[n] + 0.3 * Math.exp(-openDistance[n] / 150);
          if (e > energy) {
            energy = e;
            toward = n;
          }
        }
        if (toward < 0) continue;
        // the cliff retreats a fraction of a cell; a little extra finishes off its foot, which
        // would otherwise only ever get closer to the platform
        const retreat = Math.min(
          1,
          (p.waveErosion * energy * rock[i] * dt) / cellSize,
        );
        const cut = Math.min(
          height[i] - target,
          retreat * (height[i] - target + 3),
        );
        height[i] -= cut;
        soil[i] = Math.max(0, soil[i] - cut);
        change[toward] += cut * cellArea;
      }
    }
    // The coarse rubble settles at the cliff's foot, below the reach of the waves, and the
    // rest is swept out to the deep sea. (Following each cliff's rubble down the slope, as
    // rivers' is, took more time than all the rest of the waves.)
    for (let i = 0; i < num; i++) {
      if (change[i] <= 0) continue;
      const settled = Math.min(
        change[i],
        Math.max(0, target - 1 - height[i]) * cellArea,
      );
      height[i] += settled / cellArea;
      soil[i] += settled / cellArea;
      mud[i] += settled / cellArea / dt;
      lostSediment += change[i] - settled;
    }
  }

  /**
   * Fill from point i up to `top`, then move on down the steepest slope, settling on a 2% slope
   * that deepens away from the river mouth, until the sediment runs out or leaves the grid. On a
   * flat or in a hollow it heads out toward the open sea the way the flood came in.
   */
  function settleInSea(i, q, top, dt) {
    for (let steps = 0; q > 0 && !edge[i] && steps < N * 4; steps++) {
      const settled = Math.min(q, Math.max(0, top - height[i]) * cellArea);
      height[i] += settled / cellArea;
      soil[i] += settled / cellArea;
      mud[i] += settled / cellArea / dt;
      q -= settled;
      let next = floodReceiver[i];
      for (let k = 0; k < 8; k++) {
        const n = i + offsets[k];
        if (height[n] < height[next] && height[n] < height[i]) next = n;
      }
      top -= cellSize * 0.02;
      i = next;
    }
    lostSediment += q;
  }

  /**
   * Raise (amount > 0) or lower the ground in a soft circle.
   * @param {number} cx grid x
   * @param {number} cz grid z
   * @param {number} radius grid cells
   * @param {number} amount meters at the middle
   */
  function brush(cx, cz, radius, amount) {
    const r = Math.ceil(radius * 2);
    for (
      let z = Math.max(1, Math.floor(cz - r));
      z <= Math.min(N - 2, cz + r);
      z++
    ) {
      for (
        let x = Math.max(1, Math.floor(cx - r));
        x <= Math.min(N - 2, cx + r);
        x++
      ) {
        const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (radius * radius);
        const i = z * N + x;
        const change = amount * Math.exp(-d2 * 2);
        height[i] += change;
        // what's raised is fresh rock; what's dug away takes the sediment first
        if (change > 0) original[i] += change;
        else soil[i] = Math.max(0, soil[i] + change);
      }
    }
  }

  return {
    N,
    cellSize,
    height,
    uplift,
    water,
    wet,
    area,
    rain,
    runoff,
    cover,
    erodibility,
    rock,
    soil,
    dikes,
    wave,
    discharge,
    stack,
    receiver,
    coral,
    cloud,
    route,
    step,
    brush,
    get time() {
      return time;
    },
    get lostSediment() {
      return lostSediment;
    },
    get reefVolume() {
      return reefVolume;
    },
  };
}
