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
  upliftRate: 3, // mm/yr a volcano grows at its summit while it sits right over the hotspot
  eruptions: 0.5, // how much of that growth comes as lava flows; the rest swells it from inside
  plateSpeed: 2, // mm/yr (km per million years) the plate carries the islands off the hotspot
  sinkRate: 0.03, // mm/yr the plate sinks as it cools, drifting away from the hotspot
  flexure: 1, // how much of the volcanoes' new rock the plate bends down under (0..1)
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

// The plate slides over a hotspot, which builds a chain of volcanoes, each growing while it's
// near the hotspot and dying as the plate carries it away. Seen from the plate, the islands stay
// put and the hotspot moves, which is how it's done here, so nothing slides across the grid
// (sliding a cell at a time jerked, and old islands ran into the grid's edge). Hawaii's plate
// moves 90 mm/yr and its volcanoes are 40 to 50 km apart; here they're 2.5 to 3.5 km apart and
// the hotspot moves 2 mm/yr, so each volcano still spends about a million years over it, as
// Hawaii's do. Its track bends, as the Hawaiian–Emperor chain's does, to stay well inside the
// grid.
/** grid halves: a volcano's growth falls off by 1/e this far from the hotspot */
const HOTSPOT_REACH = 0.3;
/** grid halves between one volcano and the next, at least and at most */
const VOLCANO_GAP = [0.3, 0.4];
/** grid halves from the middle the hotspot stays within */
const HOTSPOT_RANGE = 0.45;
/** radians a year the hotspot's track can turn: it bends in arcs about 1.3 km across */
const HOTSPOT_TURN = 1.5e-6;
/** grid halves across the volcanoes it builds, at sea level, at least and at most */
const VOLCANO_SIZE = [0.2, 0.26];
// Hot rock rising under the hotspot lifts the plate around it into a swell (Hawaii's is about
// 1 km high and 1,000 km across), which it sinks back from as the hotspot moves on, so old
// islands drop out of the way of new ones.
/** m the swell lifts the plate right over the hotspot */
const SWELL_HEIGHT = 600;
/** grid halves: the swell falls off by 1/e this far from the hotspot */
const SWELL_WIDTH = 0.5;
// The plate carries old islands into cooler water, where reefs can't keep up and drown (Hawaii's
// last atoll, Kure, is at this "Darwin point"). Here that's measured by how long since the
// hotspot was last near.
/** years after the hotspot was last near that reefs start to fail, and are gone */
const REEF_DROWNS = [6e6, 10e6];
/** grid halves from the hotspot that count as near */
const HOTSPOT_NEAR = 0.4;
/** years for the plate to bend down under a new volcano's weight (taking all of it back) */
const FLEX_TIME = 300e3;
/** grid halves: the bend falls off by 1/e this far from the hotspot, where the weight goes on */
const FLEX_WIDTH = 0.6;
/** m: how thick a lava flow piles up where it runs */
const FLOW_THICKNESS = 10;
// Lava cools as it runs, so it only keeps going down slopes steeper than these; on gentler
// ground it piles up instead, which is what gives a shield volcano its slopes of a few degrees.
// In the sea it chills fast and piles up in a pillow mound or a lava delta's steep front.
/** the gentlest slope lava runs down on land (about 9°) */
const LAVA_SLOPE = 0.15;
/** the gentlest slope lava runs down in the sea (about 27°) */
const LAVA_FRONT = 0.5;
/** lava flows erupting from each volcano in a step, at full activity */
const FLOWS_PER_STEP = 10;

/** steps between rain sweeps while time runs */
const RAIN_EVERY = 5;

/** how many times more easily loose sediment erodes than average basalt */
const SEDIMENT_SOFTNESS = 2;
/** m of sediment that counts as covering the rock */
const COVERED = 0.5;
/** m: one lava flow plus the bed of ash and rubble on top of it */
export const LAYER_THICKNESS = 40;
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

/**
 * 0..1, how much ash and rubble there is at fraction f (0..1) of the way up through a layer:
 * the top third or so of each, between one lava flow and the next. The terrain shader has the
 * same bands.
 * @param {number} f
 */
export const ashBed = (f) => smooth(0.6, 0.7, f) * (1 - smooth(0.9, 1, f));

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
  const uplift = new Float32Array(num); // 0..1, how fast each point is growing over upliftRate
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
  const covered = new Uint8Array(num); // where a lava flow has reached, while it runs
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

  const island = makeIsland(N, seed, height, age, dikes);
  const half = (N - 1) / 2;
  const volcanoes = island.volcanoes.map(withFootprint);
  // the hotspot starts under the youngest volcano, heading on along the chain, in grid cells
  let hotspotX = volcanoes[volcanoes.length - 1].cx;
  let hotspotZ = volcanoes[volcanoes.length - 1].cz;
  let heading = island.chain;
  const volcanoRandom = makeRandom(seed + 3);
  const lavaRandom = makeRandom(seed + 4);
  let waypointX = NaN; // where the hotspot is heading, picked on its first move
  let waypointZ = NaN;
  // The lava layers stay where they are: the volcano grows by piling new flows on top rather
  // than lifting the old ones. (Layers that rode up with the rock crawled uphill on screen,
  // meters a second.) They wander up and down, since flows aren't even sheets. This many meters
  // are added to a point's height to find its bed; the terrain shader draws the beds from the
  // same numbers.
  const layerNoise = makeFractalNoise(makeRandom(seed + 2));
  const layerOffset = Float32Array.from(
    {length: num},
    (_, i) =>
      LAYER_THICKNESS * layerNoise(((i % N) / N) * 5, (((i / N) | 0) / N) * 5),
  );
  const stormNoise = makeFractalNoise(makeRandom(seed + 1));
  // 0..1, how much of the rubble that storms throw up stays at each point
  const storminess = Float32Array.from({length: num}, (_, i) =>
    smooth(-0.15, 0.25, stormNoise(((i % N) / N) * 6, (((i / N) | 0) / N) * 6)),
  );
  const hotspotNear = new Float64Array(num); // year the hotspot was last near each point
  const swell = new Float32Array(num); // m the swell is lifting each point now
  const bendShare = new Float32Array(num); // how much of the bend each point takes
  let bendTotal = 0;
  measureSwell();
  // no volcanoes or reefs growing near the grid's edges, which stay deep
  const edgeFade = Float32Array.from({length: num}, (_, i) => {
    const e = Math.min(
      i % N,
      (i / N) | 0,
      N - 1 - (i % N),
      N - 1 - ((i / N) | 0),
    );
    return Math.min(1, Math.max(0, (e / (N - 1) - 0.06) / 0.06));
  });
  const rubble = new Float64Array(num); // scratch for how much reef is near each point
  let time = 0;
  let lostSediment = 0; // m³ carried off the edge of the grid or out to the deep sea
  let unbent = 0; // m³ the volcanoes have added that the plate hasn't yet bent down under
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
        const bed = (height[i] - soil[i] + layerOffset[i]) / LAYER_THICKNESS;
        const ash = ashBed(bed - Math.floor(bed));
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
    moveHotspot(dt, p);
    // Volcanoes grow while they're near the hotspot, partly swelling from inside as magma
    // fills dikes and chambers, and partly in lava flows. The plate sinks as it cools, evenly
    // across the grid. A negative upliftRate skips the volcanoes and just sinks that fast.
    measureGrowth();
    const grow = Math.max(0, p.upliftRate) / 1000;
    const sink = (p.upliftRate < 0 ? -p.upliftRate : p.sinkRate) / 1000;
    // The plate also bends down under the weight of the new rock, most around the hotspot,
    // where it goes on, which drowns a new volcano's older neighbors (Maui is sinking under the
    // Big Island's weight). It takes the rock's whole volume back: the real ocean is 5 km deep
    // and swallows Hawaii's volcanoes, but this one is 1.2 km deep, and without the bend each new
    // volcano raised the whole sea floor until reefs grew over it. (Spread evenly over the grid,
    // the bend was too weak to keep new volcanoes from piling onto old ones into one big island.)
    const bend =
      (Math.max(0, unbent) / (bendTotal * cellArea)) * (dt / FLEX_TIME);
    unbent -= bend * bendTotal * cellArea;
    const inflate = grow * (1 - p.eruptions);
    for (let i = 0; i < num; i++) {
      height[i] +=
        uplift[i] * inflate * dt - sinking[i] * sink * dt - bendShare[i] * bend;
      unbent += p.flexure * uplift[i] * inflate * dt * cellArea;
    }
    if (grow > 0 && p.eruptions > 0) {
      for (const vol of volcanoes)
        unbent += p.flexure * erupt(vol, grow * p.eruptions * dt, p.seaLevel);
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
   * mm/yr the most active volcano is growing at its summit now.
   * @param {typeof defaults} p
   */
  function growthRate(p) {
    if (!(p.upliftRate > 0)) return 0;
    return p.upliftRate * Math.max(...volcanoes.map(activity));
  }

  /** 0..1, how close a volcano is to the hotspot, which is how fast it grows. */
  function activity(vol) {
    const dx = hotspotX - vol.cx;
    const dz = hotspotZ - vol.cz;
    return Math.exp(-((Math.hypot(dx, dz) / (HOTSPOT_REACH * half)) ** 2));
  }

  /**
   * Work out a volcano's footprint once, in plate cells: how much of its growth lands at each
   * point of a box around it.
   */
  function withFootprint(vol) {
    const reach = Math.ceil(2 * vol.coast * half);
    const size = 2 * reach + 1;
    const x0 = Math.round(vol.cx) - reach;
    const z0 = Math.round(vol.cz) - reach;
    const lift = new Float32Array(size * size);
    const dike = new Float32Array(size * size);
    for (let bz = 0; bz < size; bz++) {
      for (let bx = 0; bx < size; bx++) {
        const here = island.shapeAt(
          vol,
          (x0 + bx) / half - 1,
          (z0 + bz) / half - 1,
        );
        lift[bz * size + bx] = here.lift;
        dike[bz * size + bx] = here.dike;
      }
    }
    // vents open where the footprint is highest: the summit, and the axes of the rift zones
    const vents = new Float64Array(lift.length); // running total of each point's chance
    for (let k = 0; k < lift.length; k++)
      vents[k] = (k ? vents[k - 1] : 0) + lift[k] ** 4;
    // onGrid: how much of the footprint is on the grid, where it can grow
    return {...vol, x0, z0, size, lift, dike, vents, onGrid: 0};
  }

  /** Fill `uplift` from every volcano's footprint and how near the hotspot it is. */
  function measureGrowth() {
    uplift.fill(0);
    for (const vol of volcanoes) {
      const a = activity(vol);
      vol.onGrid = 0;
      if (a < 1e-3) continue;
      const {x0, z0, size, lift} = vol;
      for (let bz = 0; bz < size; bz++) {
        const z = z0 + bz;
        if (z < 0 || z >= N) continue;
        for (let bx = 0; bx < size; bx++) {
          const x = x0 + bx;
          if (x < 0 || x >= N) continue;
          const i = z * N + x;
          const here = lift[bz * size + bx] * edgeFade[i];
          uplift[i] += a * here;
          vol.onGrid += here;
        }
      }
    }
  }

  /**
   * Lava flows: from vents at the summit and along the rift zones, each runs down the steepest
   * way, piling up FLOW_THICKNESS as it goes, so it fills hollows and valleys before running on
   * past them, until its lava runs out. Fresh lava buries any sediment and starts weathering
   * from scratch.
   * @param {number} perArea m the volcano's summit would grow if it were right over the hotspot
   * @param {number} seaLevel
   * @returns {number} m³ of lava erupted
   */
  function erupt(vol, perArea, seaLevel) {
    const a = activity(vol);
    if (a < 0.02) return 0;
    const {x0, z0, size} = vol;
    // as much lava as the volcano's footprint would grow by
    const flows = Math.max(1, Math.round(FLOWS_PER_STEP * a));
    const volume = (a * perArea * vol.onGrid * cellArea) / flows;
    let erupted = 0;
    for (let f = 0; f < flows; f++) {
      const k = pickVent(vol.vents);
      const x = x0 + (k % size);
      const z = z0 + Math.floor(k / size);
      if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue;
      runLava(z * N + x, volume, seaLevel);
      erupted += volume;
    }
    return erupted;
  }

  /** A random point of a volcano's box, by the running totals of their chances. */
  function pickVent(vents) {
    const target = lavaRandom() * vents[vents.length - 1];
    let lo = 0;
    let hi = vents.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vents[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * One flow of `volume` m³ from point i. It always covers the lowest ground next to what it
   * has covered so far, counting the ground as higher the further the lava has run to get there,
   * since it cools as it goes (LAVA_SLOPE, LAVA_FRONT), and give or take a little, so it braids
   * and widens on gentle slopes. So it pools in hollows and fills valleys, runs down steep slopes
   * in a narrow tongue, fans out and stops on gentle ones, and in the sea builds a delta or a
   * pillow mound near where it went in. (Following only the steepest way down built long,
   * narrow causeways across lagoons, and lava that ran on down to the deep floor left young
   * volcanoes stuck below the sea.)
   */
  function runLava(vent, volume, seaLevel) {
    let left = volume;
    let marked = 0;
    heapSize = 0;
    push(height[vent], vent);
    covered[vent] = 1;
    pits[marked++] = vent;
    change[vent] = 0; // m it has cooled by: m traveled times the slope it can run down
    while (left > 0 && heapSize > 0) {
      const i = pop();
      if (edge[i]) continue;
      const depth = seaLevel + 1 - height[i];
      const thickness =
        depth > 0
          ? Math.min(4 * FLOW_THICKNESS, Math.max(FLOW_THICKNESS, depth))
          : FLOW_THICKNESS;
      const added = Math.min(left / cellArea, thickness);
      height[i] += added;
      soil[i] = 0;
      age[i] = -time;
      left -= added * cellArea;
      for (let d = 0; d < 8; d++) {
        const n = i + offsets[d];
        if (covered[n]) continue;
        covered[n] = 1;
        pits[marked++] = n;
        change[n] =
          change[i] +
          distances[d] * (height[n] < seaLevel ? LAVA_FRONT : LAVA_SLOPE);
        push(height[n] + change[n] + lavaRandom() * 2 * FLOW_THICKNESS, n);
      }
    }
    for (let k = 0; k < marked; k++) covered[pits[k]] = 0;
    heapSize = 0;
  }

  /**
   * A point for the hotspot to head for: inside its range, a fair way from where it is, not too
   * far behind it (or its track loops), and where it was longest ago, so it spreads its
   * volcanoes around instead of piling them on one spot.
   */
  function pickWaypoint() {
    let best = null;
    let bestAge = -Infinity;
    for (let tries = 0; tries < 40 || !best; tries++) {
      const r = HOTSPOT_RANGE * Math.sqrt(volcanoRandom());
      const a = volcanoRandom() * 2 * Math.PI;
      const x = half + Math.cos(a) * r * half;
      const z = half + Math.sin(a) * r * half;
      const toward = Math.atan2(z - hotspotZ, x - hotspotX) - heading;
      if (Math.hypot(x - hotspotX, z - hotspotZ) < 0.35 * half) continue;
      if (Math.cos(toward) < -0.2 && tries < 200) continue;
      // how long since the hotspot was there, with a little chance thrown in
      const since =
        time -
        hotspotNear[Math.round(z) * N + Math.round(x)] +
        volcanoRandom() * 1e5;
      if (since > bestAge) {
        bestAge = since;
        best = [x, z];
      }
    }
    return best;
  }

  /**
   * Fill `swell` and `bendShare` from where the hotspot is now, and lift the plate by how much
   * the swell has changed since (not at the grid's edges, which stay put).
   * @param {boolean} [move] lift the plate (not at the start, which is already on the swell)
   */
  function measureSwell(move = false) {
    bendTotal = 0;
    for (let i = 0; i < num; i++) {
      const d2 = ((i % N) - hotspotX) ** 2 + (((i / N) | 0) - hotspotZ) ** 2;
      const now = SWELL_HEIGHT * Math.exp(-d2 / (SWELL_WIDTH * half) ** 2);
      if (move) height[i] += (now - swell[i]) * sinking[i];
      swell[i] = now;
      bendShare[i] = sinking[i] * Math.exp(-d2 / (FLEX_WIDTH * half) ** 2);
      bendTotal += bendShare[i];
    }
  }

  /**
   * Move the hotspot on by dt years across the plate, turning toward its waypoint, and start
   * the next volcano just ahead of it once it's far enough from the youngest.
   * @param {number} dt
   * @param {typeof defaults} p
   */
  function moveHotspot(dt, p) {
    const speed = p.plateSpeed / 1000 / cellSize; // cells a year
    if (!(speed > 0)) return;
    if (Number.isNaN(waypointX)) [waypointX, waypointZ] = pickWaypoint();
    let want = Math.atan2(waypointZ - hotspotZ, waypointX - hotspotX);
    let turn = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
    // there, or passing it too close to turn in: on to the next
    const left = Math.hypot(waypointX - hotspotX, waypointZ - hotspotZ);
    if (left < 0.15 * half || (left < 0.3 * half && Math.abs(turn) > 1.5)) {
      [waypointX, waypointZ] = pickWaypoint();
      want = Math.atan2(waypointZ - hotspotZ, waypointX - hotspotX);
      turn = Math.atan2(Math.sin(want - heading), Math.cos(want - heading));
    }
    heading += Math.max(-HOTSPOT_TURN * dt, Math.min(HOTSPOT_TURN * dt, turn));
    hotspotX += Math.cos(heading) * speed * dt;
    hotspotZ += Math.sin(heading) * speed * dt;
    // never out of range, even mid-turn
    const r = Math.hypot(hotspotX - half, hotspotZ - half) / half;
    if (r > HOTSPOT_RANGE) {
      hotspotX = half + ((hotspotX - half) * HOTSPOT_RANGE) / r;
      hotspotZ = half + ((hotspotZ - half) * HOTSPOT_RANGE) / r;
    }
    // the plate rises onto the swell ahead and sinks back off it behind
    measureSwell(true);
    // what's near the hotspot now
    const reach = Math.ceil(HOTSPOT_NEAR * half);
    for (
      let z = Math.max(0, Math.floor(hotspotZ) - reach);
      z <= Math.min(N - 1, hotspotZ + reach);
      z++
    ) {
      for (
        let x = Math.max(0, Math.floor(hotspotX) - reach);
        x <= Math.min(N - 1, hotspotX + reach);
        x++
      ) {
        if (Math.hypot(x - hotspotX, z - hotspotZ) < reach)
          hotspotNear[z * N + x] = time;
      }
    }

    const young = volcanoes[volcanoes.length - 1];
    const gap = young.gap ?? VOLCANO_GAP[0];
    if (Math.hypot(hotspotX - young.cx, hotspotZ - young.cz) < gap * half)
      return;
    // the next one a little ahead, so it grows as the hotspot comes over it
    let x = hotspotX + Math.cos(heading) * 0.2 * half;
    let z = hotspotZ + Math.sin(heading) * 0.2 * half;
    if (Math.hypot(x - half, z - half) / half > HOTSPOT_RANGE) {
      x = hotspotX;
      z = hotspotZ;
    }
    const vol = withFootprint({
      ...island.makeVolcano(volcanoRandom, x / half - 1, z / half - 1, true),
      coast:
        VOLCANO_SIZE[0] + volcanoRandom() * (VOLCANO_SIZE[1] - VOLCANO_SIZE[0]),
    });
    vol.caldera = false;
    vol.gap =
      VOLCANO_GAP[0] + volcanoRandom() * (VOLCANO_GAP[1] - VOLCANO_GAP[0]);
    volcanoes.push(vol);
    // its dikes are in place before it grows over them
    for (let bz = 0; bz < vol.size; bz++) {
      for (let bx = 0; bx < vol.size; bx++) {
        const gx = vol.x0 + bx;
        const gz = vol.z0 + bz;
        if (gx < 0 || gz < 0 || gx >= N || gz >= N) continue;
        const i = gz * N + gx;
        dikes[i] = Math.max(dikes[i], vol.dike[bz * vol.size + bx]);
      }
    }
    // the old ones are done once the hotspot is far from them
    for (let k = volcanoes.length - 2; k >= 0; k--)
      if (activity(volcanoes[k]) < 1e-4) volcanoes.splice(k, 1);
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
        edgeFade[i] *
        (p.plateSpeed > 0
          ? 1 - smooth(REEF_DROWNS[0], REEF_DROWNS[1], time - hotspotNear[i])
          : 1) *
        Math.tanh(REEF_SURFACE_LIGHT * Math.exp(-REEF_LIGHT_FALLOFF * depth)) *
        Math.exp(-openDistance[i] / REEF_FLUSHING - mud[i] / REEF_MUD_LIMIT);
      coral[i] = rate;
      const grown = Math.min(depth, rate * p.reefGrowth * dt);
      height[i] += grown;
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
      if (
        wet[i] === 1 ||
        height[i] < seaLevel - 1.5 ||
        height[i] >= top ||
        !edgeFade[i]
      )
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
        // what's dug away takes the sediment first
        if (change < 0) soil[i] = Math.max(0, soil[i] + change);
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
    age,
    dikes,
    layerOffset,
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
    growthRate,
    /** each volcano's center in grid cells, and how active it is (0..1) */
    get volcanoes() {
      return volcanoes.map((vol) => ({
        x: vol.cx,
        z: vol.cz,
        activity: activity(vol),
      }));
    },
    get hotspot() {
      return [hotspotX, hotspotZ];
    },
    get lostSediment() {
      return lostSediment;
    },
    get reefVolume() {
      return reefVolume;
    },
  };
}
