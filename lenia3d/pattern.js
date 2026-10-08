// A pattern is a small box of cell values, {size: [x, y, z], values}, that
// can be dropped into the middle of a world.

// Chan's run-length format: rows end with $, layers with %, a number repeats
// what follows it. A cell is . (0), o (255), A to X (1 to 24), or p to y
// followed by A to X for the values above that, all out of 255.
export const decodeRle = (rle) => {
  const layers = [];
  let rows = [];
  let row = [];
  let count = '';
  let prefix = '';
  for (const ch of rle.replace(/!$/, '') + '%') {
    if (ch >= '0' && ch <= '9') {
      count += ch;
      continue;
    }
    if (ch >= 'p' && ch <= 'y') {
      prefix = ch;
      continue;
    }
    const n = count ? Number(count) : 1;
    if (ch === '$') {
      rows.push(row);
      for (let i = 1; i < n; i++) rows.push([]);
      row = [];
    } else if (ch === '%') {
      rows.push(row);
      layers.push(rows);
      for (let i = 1; i < n; i++) layers.push([]);
      rows = [];
      row = [];
    } else {
      const value =
        ch === '.' || ch === 'b'
          ? 0
          : ch === 'o'
            ? 255
            : prefix
              ? (prefix.charCodeAt(0) - 112) * 24 + ch.charCodeAt(0) - 65 + 25
              : ch.charCodeAt(0) - 64;
      for (let i = 0; i < n; i++) row.push(value / 255);
    }
    count = '';
    prefix = '';
  }
  const size = [
    Math.max(...layers.flatMap((l) => l.map((r) => r.length))),
    Math.max(...layers.map((l) => l.length)),
    layers.length,
  ];
  const values = new Float32Array(size[0] * size[1] * size[2]);
  layers.forEach((l, z) =>
    l.forEach((r, y) =>
      r.forEach((v, x) => {
        values[x + y * size[0] + z * size[0] * size[1]] = v;
      }),
    ),
  );
  return {size, values};
};

// The pattern centered in an N³ world, scaled up by zoom (trilinear), so the
// same creature can be shown at a higher resolution with a bigger kernel.
export const place = ({size, values}, N, zoom = 1) => {
  const state = new Float32Array(N * N * N);
  const [sx, sy, sz] = size;
  const at = (x, y, z) =>
    x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz
      ? 0
      : values[x + y * sx + z * sx * sy];
  const lerp = (a, b, t) => a + (b - a) * t;
  const out = size.map((s) => Math.min(N, Math.round(s * zoom)));
  const offset = out.map((s) => Math.floor((N - s) / 2));
  for (let z = 0; z < out[2]; z++) {
    for (let y = 0; y < out[1]; y++) {
      for (let x = 0; x < out[0]; x++) {
        const [fx, fy, fz] = [x, y, z].map((v) => (v + 0.5) / zoom - 0.5);
        const [ix, iy, iz] = [fx, fy, fz].map(Math.floor);
        const [tx, ty, tz] = [fx - ix, fy - iy, fz - iz];
        const plane = (z) =>
          lerp(
            lerp(at(ix, iy, z), at(ix + 1, iy, z), tx),
            lerp(at(ix, iy + 1, z), at(ix + 1, iy + 1, z), tx),
            ty,
          );
        const i = x + offset[0] + (y + offset[1]) * N + (z + offset[2]) * N * N;
        state[i] = lerp(plane(iz), plane(iz + 1), tz);
      }
    }
  }
  return state;
};

// where the mass is, per axis, as an angle around the wrapped world, so a
// creature straddling an edge is still found in one piece
export const centerOf = (state, N) => {
  const sums = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
  for (let z = 0, i = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, i++) {
        const v = state[i];
        sums[0][x] += v;
        sums[1][y] += v;
        sums[2][z] += v;
      }
    }
  }
  return sums.map((s) => {
    let c = 0;
    let si = 0;
    s.forEach((v, i) => {
      c += v * Math.cos((i / N) * 2 * Math.PI);
      si += v * Math.sin((i / N) * 2 * Math.PI);
    });
    return ((Math.atan2(si, c) / (2 * Math.PI)) * N + N) % N;
  });
};

// The creature in a world, cut out: shifted so its center is mid-box, then
// cropped to where anything is.
export const capture = (state, N) => {
  const shift = centerOf(state, N).map((c) => Math.round(N / 2 - c) + N);
  const moved = new Float32Array(N * N * N);
  const lo = [N, N, N];
  const hi = [-1, -1, -1];
  for (let z = 0, i = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++, i++) {
        const v = state[i];
        if (v < 0.002) continue;
        const p = [(x + shift[0]) % N, (y + shift[1]) % N, (z + shift[2]) % N];
        moved[p[0] + p[1] * N + p[2] * N * N] = v;
        p.forEach((c, a) => {
          lo[a] = Math.min(lo[a], c);
          hi[a] = Math.max(hi[a], c);
        });
      }
    }
  }
  const size = lo.map((l, a) => Math.max(0, hi[a] - l + 1));
  const values = new Float32Array(size[0] * size[1] * size[2]);
  for (let z = 0; z < size[2]; z++) {
    for (let y = 0; y < size[1]; y++) {
      for (let x = 0; x < size[0]; x++) {
        values[x + y * size[0] + z * size[0] * size[1]] =
          moved[x + lo[0] + (y + lo[1]) * N + (z + lo[2]) * N * N];
      }
    }
  }
  return {size, values};
};

// for saving in localStorage: one byte per cell, base64
export const packPattern = ({size, values}) => {
  let bytes = '';
  for (const v of values) bytes += String.fromCharCode(Math.round(v * 255));
  return {size, data: btoa(bytes)};
};
export const unpackPattern = ({size, data}) => ({
  size,
  values: Float32Array.from(atob(data), (c) => c.charCodeAt(0) / 255),
});
