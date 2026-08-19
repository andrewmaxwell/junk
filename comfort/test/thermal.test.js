import test from 'node:test';
import assert from 'node:assert/strict';
import {
  utci,
  vapourPressure,
  meanRadiantTemperature,
  feltTemperature,
  thermalStress,
} from '../js/thermal.js';
import { neutral } from './helpers.js';
import { ACTIVITIES } from '../js/comfort.js';

const close = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? ''} expected ${actual} within ${tolerance} of ${expected}`,
  );

// Relative humidity is not an input anywhere in the app, but it is how every
// published UTCI table states its cases, so the tests need it to compare.
const vapourKPaAt = (tempC, rh) => (vapourPressure(tempC) * rh) / 1000;

test('vapour pressure matches the published saturation values', () => {
  // The three points anyone can check: the triple point, a textbook room
  // temperature, and the boiling point at one standard atmosphere.
  close(vapourPressure(0), 6.112, 0.002, 'at 0 °C');
  close(vapourPressure(20), 23.393, 0.005, 'at 20 °C');
  close(vapourPressure(100), 1013.25, 1.5, 'at 100 °C');
});

test('vapour pressure rises monotonically', () => {
  for (let t = -40; t < 50; t += 1) {
    assert.ok(vapourPressure(t + 1) > vapourPressure(t), `not rising at ${t} °C`);
  }
});

test('UTCI returns air temperature in its own reference environment', () => {
  // Tmrt = Ta, still air, 50% RH is the environment UTCI is defined against, so
  // the polynomial has to hand back roughly what it was given. It drifts upward
  // in real heat, which is the humidity load and not an error.
  for (const airC of [-30, -20, -10, 0, 10, 20, 25, 30]) {
    const value = utci({
      airC,
      windMs: 0.5,
      tmrtC: airC,
      vapourKPa: vapourKPaAt(airC, 50),
    });
    close(value, airC, 1, `reference environment at ${airC} °C`);
  }
});

test('UTCI moves the right way for each of its four inputs', () => {
  const base = {
    airC: 30,
    windMs: 2,
    tmrtC: 30,
    vapourKPa: vapourKPaAt(30, 50),
  };
  assert.ok(utci({ ...base, airC: 32 }) > utci(base), 'hotter air');
  assert.ok(utci({ ...base, tmrtC: 45 }) > utci(base), 'sun on you');
  assert.ok(utci({ ...base, windMs: 6 }) < utci(base), 'wind cools in heat');
  assert.ok(
    utci({ ...base, vapourKPa: vapourKPaAt(30, 90) }) > utci(base),
    'humid heat is worse than dry heat',
  );
});

test('humid heat is worse than dry heat by more than a degree', () => {
  // The whole reason the app is built on UTCI rather than air temperature. At
  // 86 °F, going from 30% to 90% humidity has to cost real felt degrees.
  const dry = utci({
    airC: 30,
    windMs: 1,
    tmrtC: 30,
    vapourKPa: vapourKPaAt(30, 30),
  });
  const muggy = utci({
    airC: 30,
    windMs: 1,
    tmrtC: 30,
    vapourKPa: vapourKPaAt(30, 90),
  });
  assert.ok(muggy - dry > 5, `muggy ${muggy} vs dry ${dry}`);
});

test('wind below UTCI"s domain is clamped, not extrapolated', () => {
  // The polynomial turns over below 0.5 m/s and starts reporting *less* heat
  // stress in still air, which would make a dead-calm muggy day look better
  // than a breezy one.
  const at = (windMs) => utci({ airC: 32, windMs, tmrtC: 32, vapourKPa: vapourKPaAt(32, 70) });
  close(at(0), at(0.5), 1e-9, 'still air');
  close(at(-3), at(0.5), 1e-9, 'nonsense wind');
  assert.ok(at(0.5) > at(4), 'a breeze still has to help');
});

test('mean radiant temperature separates sun from shade', () => {
  const sunny = neutral({
    temperature_2m: 80,
    shortwave_radiation: 800,
    diffuse_radiation: 150,
    direct_radiation: 650,
    direct_normal_irradiance: 900,
    soil_temperature_0cm: 110,
    cloud_cover: 0,
  });
  const open = meanRadiantTemperature(sunny, { shaded: false });
  const shade = meanRadiantTemperature(sunny, { shaded: true });
  assert.ok(open - shade > 8, `full sun ${open} °C vs shade ${shade} °C`);
});

test('a canopy is warmer than a clear sky at night', () => {
  // Shade cuts both ways: the same leaves that block the beam by day radiate
  // back at night what an open sky would have taken away.
  const night = neutral({
    temperature_2m: 40,
    dew_point_2m: 30,
    cloud_cover: 0,
    is_day: 0,
  });
  assert.ok(
    meanRadiantTemperature(night, { shaded: true }) >
      meanRadiantTemperature(night, { shaded: false }),
  );
});

test('an overcast night is warmer than a clear one', () => {
  const at = (cloud_cover) =>
    meanRadiantTemperature(
      neutral({ temperature_2m: 40, dew_point_2m: 30, cloud_cover, is_day: 0 }),
    );
  assert.ok(at(100) > at(0));
});

test('missing radiation degrades to a shade estimate rather than failing', () => {
  // Archive rows carry no fluxes at all, and the historical comparison depends
  // on them scoring rather than throwing.
  const bare = { temperature_2m: 70, dew_point_2m: 55, wind_speed_10m: 5 };
  const felt = feltTemperature(bare, ACTIVITIES.walk);
  assert.ok(Number.isFinite(felt));
  close(felt, 70, 12, 'near air temperature');
});

test('felt temperature is null only when air temperature is missing', () => {
  assert.equal(feltTemperature({ dew_point_2m: 50 }, ACTIVITIES.walk), null);
  assert.equal(feltTemperature(null, ACTIVITIES.walk), null);
  assert.equal(feltTemperature(undefined, ACTIVITIES.walk), null);
  assert.ok(Number.isFinite(feltTemperature({ temperature_2m: 70 }, ACTIVITIES.walk)));
});

test('a dew point above the air temperature is treated as saturated', () => {
  // Open-Meteo occasionally reports one; without the clamp it makes vapour
  // pressure exceed saturation and the polynomial reports impossible heat.
  const row = neutral({ temperature_2m: 70, dew_point_2m: 85 });
  close(
    feltTemperature(row, ACTIVITIES.walk),
    feltTemperature(neutral({ temperature_2m: 70, dew_point_2m: 70 }), ACTIVITIES.walk),
    0.01,
  );
});

test('the shaded and open answers are cached apart', () => {
  // One WeakMap per exposure. Sharing one cache would have the first caller
  // decide the answer for the second.
  const row = neutral({
    temperature_2m: 85,
    shortwave_radiation: 800,
    diffuse_radiation: 150,
    direct_radiation: 650,
    direct_normal_irradiance: 900,
  });
  const open = feltTemperature(row, ACTIVITIES.walk);
  const shade = feltTemperature(row, ACTIVITIES.sit);
  assert.ok(open > shade, `${open} vs ${shade}`);
  assert.equal(feltTemperature(row, ACTIVITIES.walk), open, 'second read differs');
  assert.equal(feltTemperature(row, ACTIVITIES.sit), shade, 'second read differs');
});

test('thermal stress reports UTCI"s own category names', () => {
  assert.equal(thermalStress(65), null, 'no thermal stress says nothing');
  assert.equal(thermalStress(48.2), null, 'bottom edge of neutral');
  assert.equal(thermalStress(78.7), null, 'just below moderate heat stress');
  assert.equal(thermalStress(78.8), 'moderate heat stress');
  assert.equal(thermalStress(89.6), 'strong heat stress');
  assert.equal(thermalStress(100.4), 'very strong heat stress');
  assert.equal(thermalStress(114.8), 'extreme heat stress');
  // Cold bands are keyed by their floor, so a category owns everything from its
  // own number up to the next one.
  assert.equal(thermalStress(48.1), 'slight cold stress');
  assert.equal(thermalStress(32), 'slight cold stress');
  assert.equal(thermalStress(31.9), 'moderate cold stress');
  assert.equal(thermalStress(8.6), 'moderate cold stress');
  assert.equal(thermalStress(8.5), 'strong cold stress');
  assert.equal(thermalStress(-16.6), 'strong cold stress');
  assert.equal(thermalStress(-16.7), 'very strong cold stress');
  assert.equal(thermalStress(-40), 'very strong cold stress');
  assert.equal(thermalStress(-41), 'extreme cold stress', 'off the end of the list');
  assert.equal(thermalStress(null), null);
  assert.equal(thermalStress(NaN), null);
});
