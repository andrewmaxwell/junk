import test from 'node:test';
import assert from 'node:assert/strict';
import { PackingSolver } from './solver.js';
import { ITEM_SHAPES, CONTAINER_SHAPES } from './shapes.js';
import { circleCircle, testOverlap, worldVerts, polygonInertia } from './geometry.js';
import { validateLayout } from './validate.js';
import { findLoose } from './freedom.js';

const circle = (x, y) => ({ x, y, theta: 0, shape: ITEM_SHAPES.circle });
const square = (x, y, theta = Math.PI / 4) => ({ x, y, theta, shape: ITEM_SHAPES.square });

test('known analytic geometry: touching, penetration, rotation, and containment', () => {
  assert.equal(testOverlap(circle(0, 0), circle(1, 0)), null);
  assert.equal(testOverlap(circle(0, 0), circle(0.75, 0)).overlap, 0.25);
  const a = square(0, 0), b = square(0.75, 0);
  assert.ok(Math.abs(testOverlap(a, b).overlap - 0.25) < 1e-12);
  assert.ok(Math.abs(polygonInertia(a.shape.verts, 1) - 1 / 6) < 1e-12);
  const verts = worldVerts(square(0, 0, 0));
  assert.ok(Math.abs(Math.max(...verts.map(([x]) => x)) - Math.SQRT1_2) < 1e-12);
  const grid = [square(-0.5, -0.5), square(0.5, -0.5), square(-0.5, 0.5), square(0.5, 0.5)];
  assert.ok(validateLayout(grid, CONTAINER_SHAPES.rect.build(2, 1), 1e-10).ok);
  assert.ok(!validateLayout(grid, CONTAINER_SHAPES.rect.build(1.9, 1), 1e-10).ok);
});

test('validation rejects nonfinite input, shape data, containers, and tolerance', () => {
  const container = CONTAINER_SHAPES.circle.build(3);
  for (const value of [NaN, Infinity, -Infinity]) {
    for (const field of ['x', 'y', 'theta']) {
      assert.equal(validateLayout([{ ...circle(0, 0), [field]: value }], container).ok, false);
    }
    assert.equal(validateLayout([circle(0, 0)], { ...container, R: value }).ok, false);
    assert.equal(validateLayout([circle(0, 0)], container, value).ok, false);
    assert.equal(validateLayout([{ ...circle(0, 0), shape: { ...ITEM_SHAPES.circle, radius: value } }], container).ok, false);
  }
  assert.equal(validateLayout([circle(0, 0)], CONTAINER_SHAPES.rect.build(3, NaN)).ok, false);
  assert.equal(validateLayout([circle(0, 0)], container, -1).ok, false);
});

test('best is published immediately, efficiency only reports feasible state', () => {
  const solver = new PackingSolver({ seed: 1 });
  assert.equal(solver.best, null);
  assert.equal(solver.efficiency, null);
  solver.step();
  assert.ok(solver.best);
  assert.equal(solver.attemptIndex, 0);
  assert.equal(solver.best.scale, solver.attemptBest.scale);
  assert.equal(solver.efficiency, solver.totalItemArea / solver.best.scale ** 2);
  assert.ok(validateLayout(solver.best.items, solver.best.container, solver.config.feasibleTolerance).ok);
  const saved = JSON.stringify(solver.best);
  solver.items[0].x += 10;
  assert.equal(JSON.stringify(solver.best), saved, 'current layout cannot mutate best');
});

test('a feasible last-iteration perturbation is saved', () => {
  const solver = new PackingSolver({ seed: 1, itemShape: 'circle', containerShape: 'rect',
    count: 4, attempts: 1, iterationsPerAttempt: 1, probeIterations: 1, stuckLimit: 0,
    polishIterations: 0 });
  solver.relax = () => {};
  for (const it of solver.items) { it.x = 0; it.y = 0; }
  solver.basinHop = () => {
    solver.items.forEach((it, i) => { it.x = (i % 2 - 0.5) * 1.01; it.y = (Math.floor(i / 2) - 0.5) * 1.01; });
    return true;
  };
  const scale = solver.scale;
  solver.step();
  assert.equal(solver.best.scale, scale);
  assert.ok(solver.done);
  assert.ok(validateLayout(solver.best.items, solver.best.container).ok);
});

test('the same seed reproduces the same search', () => {
  const config = { seed: 731, attempts: 2, count: 5, iterationsPerAttempt: 300 };
  const a = new PackingSolver(config), b = new PackingSolver(config);
  while (a.step());
  while (b.step());
  assert.deepEqual(a.best, b.best);
  assert.deepEqual(a.history, b.history);
  assert.deepEqual(a.items, b.items);
});

test('coincident circle tie-breaking is deterministic; generated seed is reusable', () => {
  assert.deepEqual(circleCircle(0, 0, 1, 0, 0, 1), circleCircle(0, 0, 1, 0, 0, 1));
  const a = new PackingSolver({ count: 5 });
  const b = new PackingSolver({ count: 5, seed: a.seed });
  for (let i = 0; i < 100; i++) { a.step(); b.step(); }
  assert.deepEqual(a.items, b.items);
});

test('a rejected basin hop restores every coordinate and rotation', () => {
  const solver = new PackingSolver({ itemShape: 'circle', containerShape: 'rect', count: 4, seed: 1 });
  solver.items = [circle(-0.5, -0.5), circle(0.5, -0.5), circle(-0.5, 0.5), circle(0.5, 0.5)];
  solver.relax = () => {}; // An exact grid cannot tolerate the proposed displacement.
  const saved = structuredClone(solver.items);
  const accepted = solver.basinHop(CONTAINER_SHAPES.rect.build(2, 1));
  assert.equal(accepted, false);
  assert.deepEqual(solver.items, saved);
});

test('every supported shape/container combination finds a valid layout', () => {
  for (const itemShape of Object.keys(ITEM_SHAPES)) {
    for (const containerShape of Object.keys(CONTAINER_SHAPES)) {
      const solver = new PackingSolver({ itemShape, containerShape, count: 3, attempts: 1,
        iterationsPerAttempt: 1000, seed: 17, aspect: 1.8 });
      while (solver.step());
      assert.ok(solver.best, `${itemShape} in ${containerShape}`);
      assert.ok(validateLayout(solver.best.items, solver.best.container, solver.config.feasibleTolerance).ok,
        `${itemShape} in ${containerShape}`);
    }
  }
});

test('sliding warm-up reaches the area bound without reference layouts', () => {
  for (const count of [4, 9, 16]) {
    const solver = new PackingSolver({ itemShape: 'square', containerShape: 'rect', count, seed: 99 });
    for (let i = 0; i < 200 && !solver.done; i++) solver.step();
    assert.ok(solver.done, `n=${count} should stop at the area bound`);
    assert.equal(solver.best.scale, Math.sqrt(solver.totalItemArea));
    assert.ok(validateLayout(solver.best.items, solver.best.container, solver.config.feasibleTolerance).ok);
  }
});

test('a jammed sliding warm-up unlocks rotation and keeps the best packing', () => {
  const solver = new PackingSolver({ itemShape: 'square', containerShape: 'rect', count: 5, seed: 1 });
  let previousBest = Infinity;
  for (let i = 0; i < 1000 && !solver.stagedFinished; i++) {
    previousBest = solver.best?.scale ?? Infinity;
    solver.step();
    if (solver.best) assert.ok(solver.best.scale <= previousBest);
  }
  assert.ok(solver.stagedFinished);
  assert.ok(solver.rotationActive);
  assert.ok(solver.best);
  assert.ok(validateLayout(solver.best.items, solver.best.container, solver.config.feasibleTolerance).ok);
});

// Rattler detection, on layouts built by hand so the expected answer is known
// from geometry rather than from whatever the search happened to find.
test('loose pieces are exactly the ones with room to move', () => {
  const r = ITEM_SHAPES.circle.radius;
  const ring = (n, d) => Array.from({ length: n }, (_, k) =>
    circle(Math.cos((k * 2 * Math.PI) / n) * d, Math.sin((k * 2 * Math.PI) / n) * d));
  const circleOfRadius = (R) => CONTAINER_SHAPES.circle.build(R * Math.sqrt(Math.PI));

  // Six around one: every disc touches its neighbours and the wall.
  const seven = [circle(0, 0), ...ring(6, 2 * r)];
  assert.deepEqual(findLoose(seven, circleOfRadius(3 * r)), new Array(7).fill(false));

  // Seven around one: the ring is wedged solid but the centre has 0.3r of play,
  // which is the classic eight-in-a-circle rattler.
  const spread = r / Math.sin(Math.PI / 7);
  const eight = [circle(0, 0), ...ring(7, spread)];
  const loose = findLoose(eight, circleOfRadius(spread + r));
  assert.deepEqual(loose, [true, ...new Array(7).fill(false)], 'only the centre disc rattles');

  // An exact 2x2 tiling has nowhere to go; the same squares in a wider box do.
  const grid = [square(-0.5, -0.5), square(0.5, -0.5), square(-0.5, 0.5), square(0.5, 0.5)];
  assert.deepEqual(findLoose(grid, CONTAINER_SHAPES.rect.build(2, 1)), new Array(4).fill(false));
  assert.ok(findLoose(grid, CONTAINER_SHAPES.rect.build(2.5, 1)).every(Boolean));
  assert.deepEqual(findLoose([square(0, 0)], CONTAINER_SHAPES.rect.build(4, 1)), [true]);
});

test('a solved packing is never reported as loose where it is jammed', () => {
  // Perfect grids fill their container exactly, so nothing can rattle.
  for (const count of [4, 9, 16]) {
    const solver = new PackingSolver({ itemShape: 'square', containerShape: 'rect', count, seed: 5 });
    while (solver.step());
    const loose = findLoose(solver.best.items, solver.best.container,
      { tolerance: solver.config.feasibleTolerance });
    assert.equal(loose.filter(Boolean).length, 0, `n=${count} should be fully wedged`);
  }
});

test('the final polish refines the global best and never loses ground', () => {
  const config = { itemShape: 'square', containerShape: 'rect', count: 11, attempts: 2, seed: 4 };
  const plain = new PackingSolver({ ...config, polishIterations: 0 });
  while (plain.step());
  assert.ok(plain.history.every((h) => !h.polish), 'no polish entry when disabled');

  const polished = new PackingSolver(config);
  while (polished.step());
  const entry = polished.history.at(-1);
  assert.equal(entry.polish, true, 'the polish pass is logged as its own phase');
  assert.ok(polished.best.scale <= plain.best.scale + 1e-12, 'polish cannot lose ground');
  assert.ok(validateLayout(polished.best.items, polished.best.container,
    polished.config.feasibleTolerance).ok, 'the polished layout is still feasible');
});

test('a probe that fails scatters instead of recompressing the incumbent', () => {
  const solver = new PackingSolver({ itemShape: 'square', containerShape: 'circle',
    count: 8, attempts: 1, seed: 2 });
  // Run until something is feasible and a probe has since failed.
  for (let i = 0; i < 3000 && !(solver.attemptBest && solver.probeFailures > 0); i++) solver.step();
  assert.ok(solver.attemptBest, 'an incumbent exists to be preserved');
  assert.ok(solver.probeFailures > 0, 'a probe failed');
  const incumbent = JSON.stringify(solver.attemptBest);
  const compressed = solver.attemptBest.items.map((it) => [it.x, it.y]);
  const live = solver.items.map((it) => [it.x, it.y]);
  assert.notDeepEqual(live, compressed, 'the failed probe re-seeded rather than recompressed');
  solver.step();
  assert.equal(JSON.stringify(solver.attemptBest), incumbent, 'exploring never discards the incumbent');
});
