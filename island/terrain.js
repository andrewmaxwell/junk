// The starting island: seeded fractal noise shaped into an island, and a matching uplift map that
// says where the crust is rising.

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
 * Fill height (m) and uplift weight (0..1) for an N×N grid.
 * @param {number} N
 * @param {number} seed
 * @param {Float64Array} height
 * @param {Float32Array} uplift
 */
export function makeIsland(N, seed, height, uplift) {
  const random = makeRandom(seed);
  const shape = makeFractalNoise(random);
  const relief = makeFractalNoise(random);
  const rise = makeFractalNoise(random);
  const stretch = 0.8 + random() * 0.35; // some islands are long, some round
  const angle = random() * Math.PI;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];

  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const u = (x / (N - 1)) * 2 - 1;
      const v = (z / (N - 1)) * 2 - 1;
      const a = (u * c + v * s) * stretch;
      const b = (v * c - u * s) / stretch;
      // distance from the middle, warped so the coast has bays and headlands
      const r = Math.hypot(a, b) + 0.3 * shape(u * 1.6, v * 1.6, 4);
      const e = 1 - r / 0.62; // > 0 on land
      const i = z * N + x;
      // the grid's edges are always deep ocean
      const edge = Math.min(x, z, N - 1 - x, N - 1 - z) / (N - 1);
      height[i] = Math.min(
        -1200 + 20000 * edge,
        e > 0
          ? 40 + Math.pow(e, 0.9) * 600 * (0.7 + 0.6 * relief(u * 3, v * 3))
          : Math.max(-1200, e * 2500),
      );
      uplift[i] =
        Math.min(1, Math.max(0, (e + 0.05) * 3)) *
        Math.min(1, Math.max(0.2, 0.7 + 0.8 * rise(u * 1.3, v * 1.3, 3))) *
        Math.min(1, Math.max(0, (edge - 0.06) / 0.06));
    }
  }
}
