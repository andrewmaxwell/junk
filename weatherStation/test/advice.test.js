import test from 'node:test';
import assert from 'node:assert/strict';
import {rainSoon} from '../advice.js';

const now = new Date(2026, 10, 22, 14, 3);
// 15-minute slots from 2pm, wet where the pattern has a 1.
const slots = (pattern, snowfall = 0) =>
  [...pattern].map((c, i) => ({
    time: new Date(2026, 10, 22, 14, i * 15),
    precipitation: c === '1' ? 0.5 : 0,
    snowfall: c === '1' ? snowfall : 0,
  }));
const title = (pattern, snowfall) =>
  rainSoon({minutely: slots(pattern, snowfall), now})?.title;

test('rain starting soon', () => {
  assert.equal(title('001111111111'), 'Rain in ~25 min');
  assert.equal(title('011111111111'), 'Rain in ~10 min');
  assert.equal(title('001111111111', 0.3), 'Snow in ~25 min');
  // A lone sprinkle isn't the rain starting.
  assert.equal(title('010000111111'), 'Rain around 3:30');
});

test('rain stopping soon', () => {
  assert.equal(title('111100000000'), 'Rain stopping in ~55 min');
  // A one-slot lull isn't the rain stopping.
  assert.equal(title('101111100000'), 'Rain stopping around 3:45');
});

test('nothing to say', () => {
  assert.equal(title('000000000000'), undefined);
  assert.equal(title('111111111111'), undefined);
  // Starts more than two hours out.
  assert.equal(title('000000000001'), undefined);
  assert.ok(!rainSoon({minutely: [], now}));
});
