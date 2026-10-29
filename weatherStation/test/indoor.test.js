import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  standardEffectiveTemperature,
  clothingFor,
  dewPointF,
  relativeHumidity,
} from '../indoor.js';

const close = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${actual} within ${tolerance} of ${expected}`,
  );

const toF = (c) => c * 1.8 + 32;

// [air °C, RH %, clo, SET °C] from pythermalcomfort's set_tmp, seated, met 1.1,
// still air, radiant = air, input limits off.
const reference = JSON.parse(
  readFileSync(new URL('./set-reference.json', import.meta.url)),
);

test('SET matches pythermalcomfort across a grid of rooms', () => {
  for (const [tdb, rh, clo, expected] of reference) {
    const set = standardEffectiveTemperature({airF: toF(tdb), rh, clo});
    close(set, toF(expected), 0.1, `${tdb}°C ${rh}% ${clo} clo:`);
  }
});

test('humidity matters little in a cool room and a lot in a warm one', () => {
  const spread = (airF) =>
    standardEffectiveTemperature({airF, rh: 70, clo: 0.5}) -
    standardEffectiveTemperature({airF, rh: 30, clo: 0.5});
  assert.ok(spread(68) < 2, `68°F spread ${spread(68)}`);
  assert.ok(spread(86) > spread(68) * 2, `86°F spread ${spread(86)}`);
});

test('clothing follows the ASHRAE 55 outdoor-temperature model', () => {
  close(clothingFor(toF(27)), 0.46, 0.005);
  close(clothingFor(toF(25)), 0.47, 0.005);
  close(clothingFor(toF(-10)), 1, 0.005);
  close(clothingFor(toF(0)), 0.818, 0.005);
});

test('dew point and relative humidity round-trip', () => {
  const dew = dewPointF(72.5, 50);
  close(dew, 52.8, 0.2, 'Aranet4 reading from the scan');
  close(relativeHumidity(72.5, dew), 50, 0.01);
  close(relativeHumidity(70, 70), 100, 0.01);
});
