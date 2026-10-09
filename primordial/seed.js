import {GENES, MAX_KERNELS} from './sim.js';

// Smooth random values: random numbers on a coarse lattice, blended between.
const smoothNoise = (N, spacing) => {
  const L = Math.max(2, Math.round(N / spacing));
  const lattice = Float32Array.from({length: L * L * L}, Math.random);
  const at = (x, y, z) => lattice[(x % L) + (y % L) * L + (z % L) * L * L];
  const ease = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  return (x, y, z) => {
    const [fx, fy, fz] = [x, y, z].map((v) => (v * L) / N);
    const [ix, iy, iz] = [fx, fy, fz].map(Math.floor);
    const [tx, ty, tz] = [fx - ix, fy - iy, fz - iz].map(ease);
    const plane = (z) =>
      lerp(
        lerp(at(ix, iy, z), at(ix + 1, iy, z), tx),
        lerp(at(ix, iy + 1, z), at(ix + 1, iy + 1, z), tx),
        ty,
      );
    return lerp(plane(iz), plane(iz + 1), tz);
  };
};

// A thin haze of matter over the whole world, averaging `density` per cell
// in all, in lumps a couple of cells across, with each kind of matter mixed in
// its own pattern. The rule gathers it into bodies. Each channel's cells come
// one after another.
export const makeSeed = (N, density, channels = 1, lump = 2) => {
  const cells = N * N * N;
  const state = new Float32Array(channels * cells);
  for (let c = 0; c < channels; c++) {
    const noise = smoothNoise(N, lump);
    for (let z = 0, i = c * cells; z < N; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++, i++) {
          state[i] = (noise(x, y, z) * 2 * density) / channels;
        }
      }
    }
  }
  return state;
};

// Lineage colors, as far apart as they can be.
const palette = [
  [1.0, 0.36, 0.3],
  [0.2, 0.7, 1.0],
  [1.0, 0.82, 0.3],
  [0.45, 0.9, 0.45],
  [0.75, 0.45, 1.0],
  [1.0, 0.5, 0.8],
  [0.3, 0.95, 0.85],
  [0.95, 0.95, 0.95],
];

const wrappedDistance = (a, b, N) =>
  Math.hypot(
    ...a.map((v, i) => {
      const d = Math.abs(v - b[i]) % N;
      return Math.min(d, N - d);
    }),
  );

// Every cell's genome (GENES numbers): a weight for each kernel, then each
// one's growth center, then each one's growth width, then a lineage color,
// then hunger.
// With one lineage, every cell has the rule's own. With more, the world is
// split into that many regions (around random centers), and each lineage but
// the first has its genes scattered around the rule's, so each region starts
// out as a different species.
export const makeGenomes = (N, rule, lineages = 1) => {
  const K = MAX_KERNELS;
  const kinds = Array.from({length: lineages}, (_, l) => {
    const genome = new Float32Array(GENES);
    const spread = (amount) => (l ? Math.random() * 2 - 1 : 0) * amount;
    rule.kernels.forEach(({h, m, s}, k) => {
      genome[k] = Math.min(1, h * Math.exp(spread(1.2)));
      genome[K + k] = Math.max(0.01, m + spread(0.5) * s);
      genome[2 * K + k] = s * Math.exp(spread(0.35));
    });
    genome.set(palette[l % palette.length], 3 * K);
    genome[3 * K + 3] = Math.exp(spread(1)); // hunger, times the world's
    return genome;
  });
  const centers = kinds.map(() => [0, 1, 2].map(() => Math.random() * N));
  const genomes = new Float32Array(N * N * N * GENES);
  for (let z = 0, i = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, i++) {
        let nearest = 0;
        let best = Infinity;
        centers.forEach((c, l) => {
          const d = wrappedDistance([x, y, z], c, N);
          if (d < best) [best, nearest] = [d, l];
        });
        genomes.set(kinds[nearest], i * GENES);
      }
    }
  }
  return genomes;
};
