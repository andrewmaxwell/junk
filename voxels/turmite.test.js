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
const reference = (rule, steps) => {
  const grid = new Map();
  let p = [0, 0, 0];
  let h = [1, 0, 0];
  let u = [0, 1, 0];
  for (let i = 0; i < steps; i++) {
    const k = p.join();
    const s = grid.get(k) || 0;
    const r = cross(h, u);
    switch (rule[s]) {
      case 'L':
        h = rot(h, u, 1);
        break;
      case 'R':
        h = rot(h, u, -1);
        break;
      case 'U':
        [h, u] = [rot(h, r, 1), rot(u, r, 1)];
        break;
      case 'D':
        [h, u] = [rot(h, r, -1), rot(u, r, -1)];
        break;
      case 'B':
        h = rot(rot(h, u, 1), u, 1);
        break;
    }
    grid.set(k, (s + 1) % rule.length);
    p = p.map((v, j) => v + h[j]);
  }
  return {grid, p, h, u};
};

for (const rule of ['RL', 'LRUD', 'RUDNLB', 'UUDLR', 'LLRRUD']) {
  test(`${rule} matches the reference cell for cell`, () => {
    const steps = 30000;
    const ref = reference(rule, steps);
    const t = new Turmite(rule);
    t.run(steps / 2);
    t.run(steps / 2);
    assert.deepEqual([t.x, t.y, t.z], ref.p);
    assert.deepEqual(
      [t.hx, t.hy, t.hz].map((v) => v + 0),
      ref.h.map((v) => v + 0),
    );
    assert.deepEqual(
      [t.ux, t.uy, t.uz].map((v) => v + 0),
      ref.u.map((v) => v + 0),
    );
    let filled = 0;
    for (const [k, s] of ref.grid) {
      assert.equal(t.get(...k.split(',').map(Number)), s, k);
      if (s) filled++;
    }
    assert.equal(t.filled, filled);
    for (const [k, s] of ref.grid) {
      if (!s) continue;
      const c = k.split(',').map(Number);
      c.forEach((v, i) => assert.ok(v >= t.min[i] && v <= t.max[i]));
    }
  });
}

test('RL is 2D Langton’s ant: flat, and on its highway after ~10k steps', () => {
  const t = new Turmite('RL');
  t.run(11000);
  assert.equal(t.min[1], 0);
  assert.equal(t.max[1], 0);
  // the highway repeats every 104 steps, moving the ant 2 cells along each axis
  const a = [t.x, t.z];
  t.run(104);
  assert.deepEqual([Math.abs(t.x - a[0]), Math.abs(t.z - a[1])], [2, 2]);
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
  const palette = Array.from({length: 5}, () => [200, 200, 200]);
  let quads = 0;
  let expected = 0;
  for (const chunk of t.chunks.values()) {
    const m = meshChunk(t, chunk, palette);
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
  lone.chunkAt(0, 0, 0, true).data[0] = 1;
  const m = meshChunk(lone, lone.chunkAt(0, 0, 0), [0, [200, 100, 50]]);
  assert.equal(m.quads, 6);
  assert.ok(m.color.every((v, i) => v === [200, 100, 50][i % 3]));
});
