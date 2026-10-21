// Run with: node peopleNetwork3D/embed.test.js
import assert from 'node:assert';
import {embed, stress} from './embed.js';

let seed = 3;
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dist = (pts) =>
  pts.map((a) => pts.map((b) => Math.hypot(...a.map((x, k) => x - b[k]))));

// Distances that really come from 3D points are recovered exactly.
const pts3 = Array.from({length: 40}, () => [random(), random(), random()]);
const exact = embed(dist(pts3));
assert(exact.stress < 1e-6, `3D stress ${exact.stress}`);

// Higher dimensional points can't fit, but SMACOF must beat classical MDS
// alone and never make the fit worse with more iterations.
const pts10 = Array.from({length: 70}, () =>
  Array.from({length: 10}, () => random() * 10),
);
const d10 = dist(pts10);
const s0 = embed(d10, 0).stress;
const s50 = embed(d10, 50).stress;
const s300 = embed(d10, 300).stress;
assert(s50 < s0 && s300 <= s50 + 1e-12, `${s0} ${s50} ${s300}`);

// Scale converts real distances into 3D ones.
const {pos, scale, fit, stress: s} = embed(d10);
assert(
  Math.abs(fit[0][1] - Math.hypot(...pos[0].map((x, k) => x - pos[1][k]))) <
    1e-12,
);
assert(
  Math.abs(
    stress(
      d10,
      pos.map((p) => p.map((x) => x / scale)),
    ) - s,
  ) < 1e-12,
);

console.log('ok', {s0, s50, s300});
