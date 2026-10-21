import {topEigen} from '../peopleStats/analysis.js';

const dims = 3;

// Classical MDS: the positions whose dot products best match the double
// centered squared distances. Exact when the distances really come from points
// in 3D, and a good starting point when they don't.
const classicalMds = (dist) => {
  const n = dist.length;
  const sq = dist.map((row) => row.map((d) => d * d));
  const rowMeans = sq.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const allMean = rowMeans.reduce((a, b) => a + b, 0) / n;
  const b = sq.map((row, i) =>
    row.map((d, j) => -0.5 * (d - rowMeans[i] - rowMeans[j] + allMean)),
  );
  const eigen = topEigen(b, dims);
  return dist.map((_, i) =>
    eigen.map(({value, vector}) => vector[i] * Math.sqrt(Math.max(0, value))),
  );
};

const distances = (pos) =>
  pos.map((a) => pos.map((b) => Math.hypot(...a.map((x, k) => x - b[k]))));

// Kruskal's stress-1: the root mean squared error of the 3D distances relative
// to the real ones. 0 is a perfect fit.
export const stress = (dist, pos) => {
  const fit = distances(pos);
  let err = 0;
  let total = 0;
  for (let i = 0; i < dist.length; i++) {
    for (let j = 0; j < i; j++) {
      err += (fit[i][j] - dist[i][j]) ** 2;
      total += dist[i][j] ** 2;
    }
  }
  return Math.sqrt(err / total);
};

// SMACOF (stress majorization): repeatedly moves everyone to where the
// Guttman transform says lowers the stress, which it never raises.
const smacof = (dist, pos, iterations) => {
  const n = dist.length;
  for (let iter = 0; iter < iterations; iter++) {
    const fit = distances(pos);
    pos = pos.map((_, i) => {
      const next = Array(dims).fill(0);
      for (let j = 0; j < n; j++) {
        if (j === i || !fit[i][j]) continue;
        const ratio = dist[i][j] / fit[i][j];
        for (let k = 0; k < dims; k++) {
          next[k] += ratio * (pos[i][k] - pos[j][k]);
        }
      }
      return next.map((x) => x / n);
    });
  }
  return pos;
};

// The 3D positions whose distances best match dist, along with how well they
// do. Positions are scaled so the real distance between two people is
// distance * scale in the 3D space, which keeps the root mean square radius
// at 1.
export const embed = (dist, iterations = 100) => {
  let pos = smacof(dist, classicalMds(dist), iterations);
  const radius = Math.sqrt(
    pos.reduce((sum, p) => sum + p.reduce((s, x) => s + x * x, 0), 0) /
      pos.length,
  );
  const scale = 1 / radius;
  pos = pos.map((p) => p.map((x) => x * scale));
  const fit = distances(pos);
  return {
    pos,
    scale,
    stress: stress(
      dist,
      pos.map((p) => p.map((x) => x / scale)),
    ),
    fit,
  };
};
