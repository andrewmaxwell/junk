// Landscape evolution: the crust rises, rivers cut down, and slopes creep, following
//   dh/dt = U − K (P·A)^m · S + D ∇²h
// U is uplift, P·A is river discharge (rainfall × the area draining through a point), S is the
// slope to the next point downstream and D is how fast soil creeps downhill. River incision is
// solved implicitly along the drainage tree (Braun & Willett 2013), so it is stable at any time
// step. Depressions fill with lakes that drain over their lowest rim (priority flood, Barnes
// 2014). The sea is the base level: rivers end there and can't cut below it.

import {makeIsland} from './terrain.js';

export const defaults = {
  rain: 1.5, // m/yr of runoff
  upliftRate: 1.5, // mm/yr at the fastest-rising point
  seaLevel: 0, // m
  K: 1.5e-5, // river erodibility, for discharge in m³/yr
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
   * Fill lakes and the sea from the edges inward, record the order points were reached (which
   * never decreases in water level) and work out where each point drains.
   * @param {number} seaLevel
   */
  function route(seaLevel) {
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

    area.fill(cellSize * cellSize);
    for (let k = num - 1; k >= 0; k--) {
      const i = stack[k];
      if (receiver[i] !== i) area[receiver[i]] += area[i];
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

    route(seaLevel);

    // Rivers cut toward the point they drain to, upstream from the sea. Streams that reach a
    // lake or the sea cut down to its surface, not its floor. Lake beds don't erode.
    const factor = p.K * dt * Math.pow(p.rain, p.m);
    for (let k = 0; k < num; k++) {
      const i = stack[k];
      const r = receiver[i];
      if (r === i || wet[i]) continue;
      const base = wet[r] ? water[r] : height[r];
      const f = (factor * Math.pow(area[i], p.m)) / receiverDistance[i];
      const next = (height[i] + f * base) / (1 + f);
      if (next < height[i]) height[i] = next;
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
    receiver,
    route,
    step,
    brush,
    get time() {
      return time;
    },
  };
}
