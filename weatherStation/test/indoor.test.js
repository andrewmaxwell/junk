import test from 'node:test';
import assert from 'node:assert/strict';
import {dewPointF} from '../indoor.js';

test('dew point matches the Aranet4 reading from the scan', () => {
  const dew = dewPointF(72.5, 50);
  assert.ok(Math.abs(dew - 52.8) <= 0.2, `got ${dew}`);
});

test('at 100% humidity the dew point is the temperature', () => {
  assert.ok(Math.abs(dewPointF(70, 100) - 70) <= 0.01);
});
