// node --test voxels/turmite.test.js  (checks the fast turmite against a slow, independent one)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Turmite, parseRule} from './turmite.js';

// Reference: string-keyed Map, orientation turned by Rodrigues rotations about the local axes.
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// rotate v about unit axis a by sign * 90°
const rot = (v, a, sign) => {
  const c = cross(a, v);
  const d = dot(a, v);
  return v.map((_, i) => sign * c[i] + a[i] * d);
};
// Ants as [heading, up, hand, position], built by closing the first ant under generators rather than by
// listing matrices as turmite.js does.
const formation = (count) => {
  const flipped = (axis) => (vec) => vec.map((v, i) => (i === axis ? -v : v));
  const flip =
    (axis) =>
    ([h, u, hand, p]) =>
      [h, u, p].map(flipped(axis)).toSpliced(2, 0, -hand);
  const turn =
    (axis) =>
    ([h, u, hand, p]) => [
      rot(h, axis, 1),
      rot(u, axis, 1),
      hand,
      rot(p, axis, 1),
    ];
  const generators = {
    1: [],
    2: [flip(0)],
    4: [flip(0), flip(1)],
    8: [flip(0), flip(1), flip(2)],
    24: [turn([1, 0, 0]), turn([0, 1, 0])],
    48: [turn([1, 0, 0]), turn([0, 1, 0]), flip(0)],
  }[count];
  const seen = new Map();
  const todo = [[[1, 0, 0], [0, 1, 0], 1, count > 1 ? [3, 1, 2] : [0, 0, 0]]];
  while (todo.length) {
    const ant = todo
      .pop()
      .map((v) => (Array.isArray(v) ? v.map((c) => c + 0) : v));
    const key = JSON.stringify(ant);
    if (seen.has(key)) continue;
    seen.set(key, ant);
    for (const g of generators) todo.push(g(ant));
  }
  return [...seen.values()];
};

const reference = (rule, steps, count = 1) => {
  const grid = new Map();
  const age = new Map();
  const ants = formation(count).map(([h, u, hand, p]) => ({p, h, u, hand}));
  for (let i = 1; i <= steps; i++) {
    const read = ants.map((ant) => grid.get(ant.p.join()) || 0);
    ants.forEach((ant, j) => {
      const k = ant.p.join();
      let {h, u} = ant;
      const r = cross(h, u).map((v) => v * ant.hand); // the ant's own right
      const yaw = ant.hand; // a mirror image turns the other way about its up
      switch (rule[read[j]]) {
        case 'L':
          h = rot(h, u, yaw);
          break;
        case 'R':
          h = rot(h, u, -yaw);
          break;
        case 'U':
          [h, u] = [rot(h, r, ant.hand), rot(u, r, ant.hand)];
          break;
        case 'D':
          [h, u] = [rot(h, r, -ant.hand), rot(u, r, -ant.hand)];
          break;
        case 'B':
          h = h.map((v) => -v);
          break;
      }
      grid.set(k, ((grid.get(k) || 0) + 1) % rule.length);
      age.set(k, i);
      Object.assign(ant, {h, u, p: ant.p.map((v, c) => v + h[c])});
    });
  }
  return {grid, age, ants};
};

const antKey = (p, h, u) => [...p, ...h, ...u].map((v) => v + 0).join();
const ageAt = (t, x, y, z) => {
  const chunk = t.chunkAt(x >> 5, y >> 5, z >> 5);
  return chunk ? chunk.age[((y & 31) << 10) | ((z & 31) << 5) | (x & 31)] : 0;
};

for (const [rule, count] of [
  ['RL', 1],
  ['LRUD', 1],
  ['RUDNLB', 1],
  ['UUDLR', 1],
  ['LLRRUD', 1],
  ['LRULL', 2],
  ['LNURD', 4],
  ['RUDNLB', 8],
  ['LRUD', 24],
  ['UUDLR', 48],
]) {
  test(`${rule} with ${count} ant(s) matches the reference cell for cell`, () => {
    const steps = count > 8 ? 4000 : 30000;
    const ref = reference(rule, steps, count);
    const t = new Turmite(rule, count);
    t.run(steps / 2);
    t.run(steps / 2);
    assert.equal(t.ants.length, count);
    assert.deepEqual(
      t.ants
        .map((a) =>
          antKey([a.x, a.y, a.z], [a.hx, a.hy, a.hz], [a.ux, a.uy, a.uz]),
        )
        .sort(),
      ref.ants.map((a) => antKey(a.p, a.h, a.u)).sort(),
    );
    let filled = 0;
    for (const [k, s] of ref.grid) {
      const c = k.split(',').map(Number);
      assert.equal(t.get(...c), s, k);
      assert.equal(ageAt(t, ...c), ref.age.get(k), `age at ${k}`);
      if (!s) continue;
      filled++;
      c.forEach((v, i) => assert.ok(v >= t.min[i] && v <= t.max[i]));
    }
    assert.equal(t.filled, filled);
  });
}

test('48 ants keep the full symmetry of the cube', () => {
  const t = new Turmite('LRULL', 48);
  t.run(3000);
  assert.ok(t.filled > 1000);
  for (const chunk of t.chunks.values())
    chunk.data.forEach((s, i) => {
      if (!s) return;
      const [x, y, z] = [
        chunk.cx * 32 + (i & 31),
        chunk.cy * 32 + (i >> 10),
        chunk.cz * 32 + ((i >> 5) & 31),
      ];
      // a quarter turn about each axis and a mirror generate every symmetry
      assert.equal(t.get(x, -z, y), s);
      assert.equal(t.get(z, y, -x), s);
      assert.equal(t.get(-x, y, z), s);
    });
});

test('RL is 2D Langton’s ant: flat, and on its highway after ~10k steps', () => {
  const t = new Turmite('RL');
  t.run(11000);
  assert.equal(t.min[1], 0);
  assert.equal(t.max[1], 0);
  // the highway repeats every 104 steps, moving the ant 2 cells along each axis
  const ant = t.ants[0];
  const a = [ant.x, ant.z];
  t.run(104);
  assert.deepEqual([Math.abs(ant.x - a[0]), Math.abs(ant.z - a[1])], [2, 2]);
});

test('parseRule', () => {
  assert.equal(parseRule(' lr-ud '), 'LRUD');
  assert.equal(parseRule('L'), null);
  assert.equal(parseRule('xyz'), null);
});

test('mesher: one quad per exposed face, wound to face outwards, lit when open', async () => {
  const {meshChunk} = await import('./mesher.js');
  const t = new Turmite('LRULL');
  t.run(200000);
  let quads = 0;
  let expected = 0;
  for (const chunk of t.chunks.values()) {
    const m = meshChunk(t, chunk);
    quads += m.quads;
    const o = [chunk.cx, chunk.cy, chunk.cz].map((c) => c * 32);
    for (let i = 0; i < m.index.length; i += 3) {
      const p = [0, 1, 2].map((k) => [
        ...m.position.subarray(m.index[i + k] * 3, m.index[i + k] * 3 + 3),
      ]);
      const n = [...m.normal.subarray(m.index[i] * 3, m.index[i] * 3 + 3)];
      const e1 = p[1].map((v, j) => v - p[0][j]);
      const e2 = p[2].map((v, j) => v - p[0][j]);
      const c = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      assert.ok(c[0] * n[0] + c[1] * n[1] + c[2] * n[2] > 0, 'winding');
    }
    for (let y = 0; y < 32; y++)
      for (let z = 0; z < 32; z++)
        for (let x = 0; x < 32; x++) {
          const [X, Y, Z] = [x + o[0], y + o[1], z + o[2]];
          if (!t.get(X, Y, Z)) continue;
          for (const [a, b, c] of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ])
            if (!t.get(X + a, Y + b, Z + c)) expected++;
        }
  }
  assert.equal(quads, expected);

  const lone = new Turmite('LR');
  const chunk = lone.chunkAt(0, 0, 0, true);
  chunk.data[0] = 1;
  chunk.age[0] = 7;
  const m = meshChunk(lone, chunk);
  assert.equal(m.quads, 6);
  // state 1, last visited at step 7, every corner fully open
  assert.ok(m.voxel.every((v, i) => v === [1, 7, 1][i % 3]));
});
