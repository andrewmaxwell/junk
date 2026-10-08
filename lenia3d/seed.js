// Smooth random values: random numbers on a coarse lattice, blended between.
// The rule only ever adds smooth amounts to cells, so speckle in the seed
// would stay on the creatures' surfaces forever.
const smoothNoise = (N, spacing) => {
  const L = Math.max(2, Math.round(N / spacing));
  const lattice = Float32Array.from({length: L * L * L}, Math.random);
  const at = (x, y, z) => lattice[(x % L) + (y % L) * L + (z % L) * L * L];
  const ease = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const [fx, fy, fz] = [x, y, z].map((v) => (v * L) / N);
    const [ix, iy, iz] = [fx, fy, fz].map(Math.floor);
    const [tx, ty, tz] = [fx - ix, fy - iy, fz - iz].map(ease);
    const lerp = (a, b, t) => a + (b - a) * t;
    const plane = (z) =>
      lerp(
        lerp(at(ix, iy, z), at(ix + 1, iy, z), tx),
        lerp(at(ix, iy + 1, z), at(ix + 1, iy + 1, z), tx),
        ty,
      );
    return lerp(plane(iz), plane(iz + 1), tz);
  };
};

// distance between two points in a world that wraps around
const wrappedDistance = (a, b, N) =>
  Math.hypot(
    ...a.map((v, i) => {
      const d = Math.abs(v - b[i]) % N;
      return Math.min(d, N - d);
    }),
  );

// A few soft balls of smooth noise, about as wide as the kernel, kept apart
// from each other: overlapping seeds make one big blob that often erupts.
export const makeSeed = (N, R, count = 4) => {
  const state = new Float32Array(N * N * N);
  const noise = smoothNoise(N, R / 3);
  const centers = [];
  for (let tries = 0; centers.length < count && tries < 1000; tries++) {
    const c = [0, 1, 2].map(() => Math.random() * N);
    if (centers.every((o) => wrappedDistance(c, o, N) > R * 4)) {
      centers.push(c);
    }
  }
  for (const center of centers) {
    const r = Math.ceil(R * 1.2);
    for (let z = -r; z <= r; z++) {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const edge = 1 - Math.hypot(x, y, z) / r;
          if (edge <= 0) continue;
          const [px, py, pz] = [x, y, z].map(
            (v, a) => (Math.floor(center[a] + v) + N) % N,
          );
          const v = noise(px, py, pz) * Math.min(1, edge * 4);
          const i = px + py * N + pz * N * N;
          state[i] = Math.max(state[i], v);
        }
      }
    }
  }
  return state;
};
