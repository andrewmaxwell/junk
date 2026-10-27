// Landscape evolution: the crust rises, rivers cut down, and slopes creep, following
//   dh/dt = U − K Q^m · S + D ∇²h
// U is uplift, Q is river discharge (the rain falling on everything upstream of a point), S is
// the slope to the next point downstream and D is how fast soil creeps downhill. River incision
// is solved implicitly along the drainage tree (Braun & Willett 2013), so it is stable at any
// time step. Depressions fill with lakes that drain over their lowest rim (priority flood,
// Barnes 2014). The sea is the base level: rivers end there and can't cut below it.
// What rivers cut away is carried downstream and settles where they reach still water, filling
// lakes and building deltas. Rain is heavier where the wind climbs a slope and lighter in the
// lee, and moist air dries out as it rains crossing the island, which leaves a rain shadow.
// It cools 6.5 °C per km of height. Plants and soil return part of the rain to the air (the
// Budyko curve), so only the rest runs off into rivers, and hot, dry places lose almost all of
// it on average. But desert rain comes in storms that run straight off bare ground, so up to
// 30% of it still reaches the rivers in flash floods. Plant cover follows how wet and warm a
// place is, and roots hold the soil: bare ground erodes e² ≈ 7 times faster than full cover.

import {makeIsland} from './terrain.js';

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
  const erodibility = new Float32Array(num); // K, lowered by plant cover
  const moisture = new Float32Array(num); // water vapor, 1 for air fresh off the sea
  const cloud = new Float32Array(num); // condensed water still falling
  const sediment = new Float64Array(num); // m³ carried out of each point this step
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
  const distances = neighborOffsets.map(
    ([dx, dz]) => Math.hypot(dx, dz) * cellSize,
  );
  const isEdge = (i) => {
    const x = i % N;
    const z = (i / N) | 0;
    return x === 0 || z === 0 || x === N - 1 || z === N - 1;
  };
  const edge = Uint8Array.from({length: num}, (_, i) => +isEdge(i));

  makeIsland(N, seed, height, uplift);
  let time = 0;
  let lostSediment = 0; // m³ carried off the edge of the grid
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
      runoff[i] = Math.max(rain[i] - lost, rain[i] * 0.3 * (1 - cover[i]));
      erodibility[i] = p.K * Math.exp(-2 * cover[i]);
    }
  }

  /**
   * Work out the rain, fill lakes and the sea from the edges inward, record the order points
   * were reached (which never decreases in water level) and work out where each point drains.
   * @param {typeof defaults} p
   */
  function route(p) {
    const {seaLevel} = p;
    updateRain(p);
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
    for (let i = 0; i < num; i++) {
      if (!edge[i]) height[i] += uplift[i] * upliftRate * dt;
    }

    route(p);

    // Rivers cut toward the point they drain to, upstream from the sea. Streams that reach a
    // lake or the sea cut down to its surface, not its floor. Lake beds don't erode.
    sediment.fill(0);
    for (let k = 0; k < num; k++) {
      const i = stack[k];
      const r = receiver[i];
      if (r === i || wet[i]) continue;
      const base = wet[r] ? water[r] : height[r];
      const f =
        (erodibility[i] * dt * Math.pow(discharge[i], p.m)) /
        receiverDistance[i];
      const next = (height[i] + f * base) / (1 + f);
      if (next < height[i]) {
        sediment[i] = (height[i] - next) * cellArea;
        height[i] = next;
      }
    }

    // Carry it downstream. It passes over dry land and settles in still water. Lakes fill up to
    // their surface from where rivers enter, then pass the rest on toward their outlet. At the
    // sea it fills to a meter below sea level and slides on down the steepest slope, so deltas
    // build out from river mouths.
    for (let k = num - 1; k >= 0; k--) {
      const i = stack[k];
      let q = sediment[i];
      if (q <= 0) continue;
      if (wet[i] === 2) {
        settleInSea(i, q, seaLevel - 1);
        continue;
      }
      if (wet[i]) {
        const settled = Math.min(
          q,
          Math.max(0, water[i] - height[i]) * cellArea,
        );
        height[i] += settled / cellArea;
        q -= settled;
      }
      if (receiver[i] === i) lostSediment += q;
      else sediment[receiver[i]] += q;
    }

    // Soil creep, faster under water. Explicit, in as many substeps as stability needs.
    const fastest = Math.max(p.D, p.marineD);
    const substeps = Math.ceil((fastest * dt) / (cellSize * cellSize) / 0.2);
    const h = dt / substeps / (cellSize * cellSize);
    for (let s = 0; s < substeps; s++) {
      change.fill(0);
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++) {
          const i = z * N + x;
          const Di = height[i] < seaLevel ? p.marineD : p.D;
          if (x < N - 1) {
            const j = i + 1;
            const Dj = height[j] < seaLevel ? p.marineD : p.D;
            const flow = ((Di + Dj) / 2) * (height[i] - height[j]) * h;
            change[i] -= flow;
            change[j] += flow;
          }
          if (z < N - 1) {
            const j = i + N;
            const Dj = height[j] < seaLevel ? p.marineD : p.D;
            const flow = ((Di + Dj) / 2) * (height[i] - height[j]) * h;
            change[i] -= flow;
            change[j] += flow;
          }
        }
      }
      for (let i = 0; i < num; i++) if (!edge[i]) height[i] += change[i];
    }

    time += dt;
  }

  /**
   * Fill from point i up to `top`, then move on down the steepest slope, settling on a 2% slope
   * that deepens away from the river mouth, until the sediment runs out or leaves the grid. On a
   * flat or in a hollow it heads out toward the open sea the way the flood came in.
   */
  function settleInSea(i, q, top) {
    for (let steps = 0; q > 0 && !edge[i] && steps < N * 4; steps++) {
      const settled = Math.min(q, Math.max(0, top - height[i]) * cellArea);
      height[i] += settled / cellArea;
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
        height[z * N + x] += amount * Math.exp(-d2 * 2);
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
    discharge,
    receiver,
    route,
    step,
    brush,
    get time() {
      return time;
    },
    get lostSediment() {
      return lostSediment;
    },
  };
}
