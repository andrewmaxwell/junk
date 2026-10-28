// The starting island: seeded fractal noise shaped into an island, and a matching uplift map that
// says where the crust is rising.

/** m: the deep ocean floor around the island, where it meets the grid's edges */
export const DEEP_FLOOR = -1200;

/**
 * Seeded random numbers in [0, 1) (mulberry32).
 * @param {number} seed
 */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Smooth value noise with several octaves, roughly in [-1, 1].
 * @param {() => number} random
 */
export function makeFractalNoise(random) {
  const size = 256;
  const values = Float32Array.from(
    {length: size * size},
    () => random() * 2 - 1,
  );
  const smooth = (t) => t * t * (3 - 2 * t);
  const lattice = (x, y) => values[(y & (size - 1)) * size + (x & (size - 1))];
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = lattice(xi, yi) + (lattice(xi + 1, yi) - lattice(xi, yi)) * u;
    const b =
      lattice(xi, yi + 1) + (lattice(xi + 1, yi + 1) - lattice(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
  const ox = random() * 100;
  const oy = random() * 100;
  return (x, y, octaves = 5) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise((x + ox) * freq + o * 17.3, (y + oy) * freq);
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum * 1.6;
  };
}

/**
 * A chain of shield volcanoes, oldest first, like the islands a hotspot builds as the plate
 * slides over it: each a broad dome stretched along two or three rift zones, the youngest still
 * growing and topped by a caldera. Fills height (m), uplift weight (0..1, which here is mostly
 * lava building up the young volcano), the age of the lava at the surface (years), and how much
 * of the rock is dikes (0..1): the hard sheets of basalt that fed the rift zones' eruptions.
 * @param {number} N
 * @param {number} seed
 * @param {Float64Array} height
 * @param {Float32Array} uplift
 * @param {Float32Array} age
 * @param {Float32Array} dikes
 */
export function makeIsland(N, seed, height, uplift, age, dikes) {
  const random = makeRandom(seed);
  const shape = makeFractalNoise(random);
  const relief = makeFractalNoise(random);
  const warp = makeFractalNoise(random);
  const count = random() < 0.5 ? 2 : 3;
  const chain = random() * Math.PI * 2;
  const spacing = 0.26 + random() * 0.1;
  const volcanoes = Array.from({length: count}, (_, k) => {
    const along = (k - (count - 1) / 2) * spacing;
    const young = k === count - 1;
    // the chain bends a little, as hotspot tracks do
    const a = chain + (random() - 0.5) * 0.6;
    const rifts = 2 + (random() < 0.4 ? 1 : 0);
    const riftStart = chain + (random() - 0.5) * 1.2;
    return {
      x: Math.cos(a) * along,
      z: Math.sin(a) * along,
      top: young ? 450 + random() * 250 : 650 + random() * 350,
      coast: (young ? 0.3 : 0.38) + random() * 0.08, // radius at sea level, in grid halves
      age: young ? random() * 50e3 : (count - k) * (0.35e6 + random() * 0.2e6),
      activity: young ? 1 : k === count - 2 ? 0.3 : 0.1,
      rifts: Array.from(
        {length: rifts},
        (_, r) =>
          riftStart + (r * Math.PI * 2) / rifts + (random() - 0.5) * 0.7,
      ),
      caldera: young,
    };
  });

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const u = (x / (N - 1)) * 2 - 1;
      const v = (z / (N - 1)) * 2 - 1;
      const i = z * N + x;
      let best = -Infinity;
      let lift = 0;
      let dike = 0;
      age[i] = 0;
      for (const vol of volcanoes) {
        const du = u - vol.x;
        const dv = v - vol.z;
        const d = Math.hypot(du, dv);
        const theta = Math.atan2(dv, du);
        // rift zones stretch the dome into a star, and the coast has bays and headlands
        let stretch = 0;
        for (const a of vol.rifts)
          stretch += Math.max(0, Math.cos(theta - a)) ** 6;
        const r =
          d / (1 + 0.5 * stretch) / vol.coast +
          0.25 * shape(u * 1.6, v * 1.6, 4);
        let h =
          r < 1
            ? vol.top * (1 - r ** 1.4) * (0.9 + 0.2 * relief(u * 3, v * 3, 3))
            : Math.max(DEEP_FLOOR, -1920 * (r - 1));
        if (h > best) {
          best = h;
          age[i] = vol.age;
        }
        lift += vol.activity * Math.max(0, 1 - r * r);
        // Dikes: thin vertical sheets parallel to each rift, densest along its axis, and a solid
        // core of them under the summit.
        for (const a of vol.rifts) {
          const along = du * Math.cos(a) + dv * Math.sin(a);
          const across = -du * Math.sin(a) + dv * Math.cos(a);
          if (along < 0) continue;
          const zone =
            Math.exp(-((across / 0.07) ** 2)) *
            smooth01(1.2 - along / vol.coast);
          const sheet = Math.abs(
            Math.sin((across / 0.02) * Math.PI + 3 * warp(u * 4, v * 4)),
          );
          dike = Math.max(dike, zone * smooth01((sheet - 0.85) / 0.1));
        }
        dike = Math.max(dike, smooth01((0.09 - d) / 0.04) * 0.8);
        if (vol.caldera) best -= 110 * smooth01((0.11 - d) / 0.03);
      }
      // the grid's edges are always deep ocean
      const edge = Math.min(x, z, N - 1 - x, N - 1 - z) / (N - 1);
      height[i] = Math.min(
        DEEP_FLOOR + 20000 * edge,
        Math.max(DEEP_FLOOR, best),
      );
      uplift[i] =
        Math.min(1, 0.15 + lift) *
        Math.min(1, Math.max(0, (edge - 0.06) / 0.06)) *
        smooth01((best + 600) / 600);
      dikes[i] = dike;
    }
  }
}

/** 0 below 0, 1 above 1, smooth between */
function smooth01(t) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
