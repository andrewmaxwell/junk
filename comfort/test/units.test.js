import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UNITS, defaultUnits} from '../js/units.js';

test('metric converts from the model units it is handed', () => {
  assert.equal(UNITS.metric.temp(32), 0);
  assert.equal(UNITS.metric.temp(212), 100);
  assert.equal(UNITS.metric.temp(-40), -40);
  assert.equal(UNITS.metric.speed(10), '16 km/h');
});

test('US units pass the model values through', () => {
  assert.equal(UNITS.us.temp(77.4), 77);
  assert.equal(UNITS.us.speed(7.6), '8 mph');
});

test('the default follows the region the language implies', () => {
  assert.equal(defaultUnits('en-US'), UNITS.us);
  assert.equal(defaultUnits('en'), UNITS.us); // maximizes to en-Latn-US
  assert.equal(defaultUnits('en-GB'), UNITS.metric);
  assert.equal(defaultUnits('de'), UNITS.metric);
  assert.equal(defaultUnits('not a locale'), UNITS.us);
});
