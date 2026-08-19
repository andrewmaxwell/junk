// Shared fixtures. Every field the model reads is set explicitly, because a
// missing one is the difference between testing the model and testing its
// fallbacks — and the fallbacks have their own tests below.
import { ACTIVITIES } from '../js/comfort.js';
import { feltTemperature } from '../js/thermal.js';

// A row with no radiation fields at all, which makes mean radiant temperature
// degrade to roughly air temperature. That is the point: it takes the sun out
// of the picture so a test that means to vary one thing varies one thing.
export const neutral = (over = {}) => ({
  temperature_2m: 65,
  dew_point_2m: 45,
  wind_speed_10m: 5,
  wind_gusts_10m: 8,
  cloud_cover: 50,
  uv_index: 0,
  us_aqi: 20,
  is_day: 1,
  precipitation: 0,
  weather_code: 1,
  interval: 3600,
  ...over,
});

// Air temperature that puts the felt temperature at `target` °F for `activity`,
// found by bisection. Lets a test say "strong heat stress" and mean it, instead
// of hard-coding an air temperature that only happens to land there.
export function rowFeeling(target, activity = ACTIVITIES.walk, over = {}) {
  let lo = -80;
  let hi = 140;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (feltTemperature(neutral({ ...over, temperature_2m: mid }), activity) < target) lo = mid;
    else hi = mid;
  }
  // `hi` and not the midpoint: the loop's invariant is that `hi` feels at least
  // `target`, and a fixture built to sit on a category edge has to land on the
  // inside of it rather than a hair below.
  return neutral({ ...over, temperature_2m: hi });
}

export const hourly = (scores, start = new Date('2026-08-19T06:00:00')) =>
  scores.map((over, i) => ({
    ...neutral(over),
    time: new Date(start.getTime() + i * 3600 * 1000),
  }));
