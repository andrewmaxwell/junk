import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readParams, writeParams, toNumber, DEFAULTS} from './params.js';

test('an empty query gives the defaults', () => {
  assert.deepEqual(readParams(''), DEFAULTS);
});

test('missing, empty and unparseable numbers fall back instead of reading as zero', () => {
  for (const n of ['', ' ', 'abc']) {
    assert.equal(
      readParams(`?n=${n}`).count,
      DEFAULTS.count,
      `n=${JSON.stringify(n)}`,
    );
  }
  assert.equal(readParams('?container=rect&aspect=').aspect, DEFAULTS.aspect);
  assert.ok(Number.isNaN(toNumber('')));
  assert.ok(Number.isNaN(toNumber(null)));
  assert.equal(toNumber('7'), 7);
});

test('numbers are clamped to the control limits and counts rounded', () => {
  assert.equal(readParams('?n=0').count, 3);
  assert.equal(readParams('?n=1000').count, 40);
  assert.equal(readParams('?n=7.6').count, 8);
  assert.equal(readParams('?aspect=9').aspect, 2.5);
});

test('only real shape keys are accepted, not inherited object properties', () => {
  assert.equal(readParams('?item=hexagon').itemShape, 'hexagon');
  assert.equal(readParams('?item=toString').itemShape, DEFAULTS.itemShape);
  assert.equal(
    readParams('?container=__proto__').containerShape,
    DEFAULTS.containerShape,
  );
});

test('writing then reading round-trips, with aspect only where it applies', () => {
  const rect = {
    itemShape: 'triangle',
    containerShape: 'rect',
    aspect: 1.7,
    count: 9,
  };
  assert.deepEqual(readParams(writeParams(rect)), rect);
  const circle = {...rect, containerShape: 'circle'};
  assert.ok(!writeParams(circle).includes('aspect'));
});
