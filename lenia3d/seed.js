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
export const makeSeed = (N, density, channels = 1) => {
  const cells = N * N * N;
  const state = new Float32Array(channels * cells);
  for (let c = 0; c < channels; c++) {
    const noise = smoothNoise(N, 2);
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
