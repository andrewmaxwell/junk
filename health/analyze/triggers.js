// Tests suspected headache triggers: is a calendar headache more likely to
// start on days after (or with) each exposure? Compares exposed and
// unexposed days within the same calendar month (Mantel-Haenszel risk
// ratio), so slow changes like medications, CPAP, surgeries, and seasons
// can't masquerade as trigger effects.
// Usage: node health/analyze/triggers.js

import {printRiskRatios, query} from './stats.js';

// Each exposure is true, false, or null when that day has no data for it.
// "_yday" exposures look at the previous day, so they can't be a result of
// the headache.
const rows = await query(`
  WITH d AS (
    SELECT *,
      lag(tags) OVER w AS tags_yday,
      lag(exercise) OVER w AS exercise_yday,
      lag(outdoor_temp_max) OVER w AS temp_max_yday,
      lag(energy) OVER w AS energy_yday,
      lag(drive_min) OVER w AS drive_min_yday,
      lag(hours_out) OVER w AS hours_out_yday
    FROM days WINDOW w AS (ORDER BY day)
  )
  SELECT
    day, strftime(day, '%Y-%m') AS stratum,
    headache_events > 0 AS headache,
    headache_events > 0 AND headache_first_time >= TIME '10:00' AS headache_after_10am,
    outdoor_temp_max >= 32 AS hot_day,
    temp_max_yday >= 32 AS hot_yday,
    abs(pressure_change_24h) >= 6 AS pressure_swing,
    pressure_change_24h <= -5 AS pressure_drop,
    CASE WHEN tags_yday IS NOT NULL AND energy_yday IS NOT NULL THEN list_contains(tags_yday, 'alcohol') END AS alcohol_yday,
    CASE WHEN energy_yday IS NOT NULL THEN list_contains(tags_yday, 'physical_work') OR exercise_yday >= 5 END AS overexertion_yday,
    CASE WHEN energy_yday IS NOT NULL THEN list_contains(tags_yday, 'physical_work') AND temp_max_yday >= 30 END AS hot_exertion_yday,
    CASE WHEN energy_yday IS NOT NULL THEN list_has_any(tags_yday, ['coffee', 'decaf']) END AS caffeine_unusual_yday,
    CASE WHEN energy IS NOT NULL THEN list_has_any(tags, ['travel', 'away']) END AS traveling,
    CASE WHEN energy IS NOT NULL THEN list_has_any(tags, ['poor_sleep', 'insomnia', 'woke_early', 'woke_tired']) END AS poor_sleep_noted,
    cpap_usage_min < 360 AS cpap_under_6h,
    insomnia,
    slept_km_from_home >= 50 AS slept_away,
    drive_min_yday >= 180 AS long_drive_yday,
    hours_out_yday >= 10 AS long_day_out_yday,
    cpap_breaks >= 1 AS cpap_mask_break,
    ahi >= 5 AS ahi_5_plus
  FROM d
  WHERE day BETWEEN DATE '2021-08-27' AND current_date - 1
`);

const exposures = [
  ['hot_day', 'Heat: high >= 32C/90F that day'],
  ['hot_yday', 'Heat: high >= 32C/90F the day before'],
  [
    'overexertion_yday',
    'Overexertion the day before (physical work tag or exercise 5/5)',
  ],
  ['hot_exertion_yday', 'Physical work on a 30C+/86F+ day, the day before'],
  ['alcohol_yday', 'Alcohol the day before'],
  ['caffeine_unusual_yday', 'Unusual caffeine noted the day before'],
  ['traveling', 'Traveling or away (more caffeine, different sleep)'],
  ['slept_away', 'Location: slept 50+ km from home'],
  ['long_drive_yday', 'Location: 3+ hours in a car the day before'],
  ['long_day_out_yday', 'Location: 10+ hours away from home the day before'],
  [
    'poor_sleep_noted',
    'Poor sleep noted in journal (same day; may be caused by the headache)',
  ],
  ['cpap_under_6h', 'CPAP: under 6 hours the night before'],
  ['insomnia', 'CPAP: 30+ min awake starting 3-6am'],
  ['cpap_mask_break', 'CPAP: took mask off mid-night'],
  ['ahi_5_plus', 'CPAP: AHI >= 5'],
  ['pressure_swing', 'Weather: pressure changed 6+ hPa in 24h (from notes)'],
  ['pressure_drop', 'Weather: pressure fell 5+ hPa in 24h (from notes)'],
];

for (const outcome of ['headache', 'headache_after_10am']) {
  console.log(
    `\nOutcome: ${outcome === 'headache' ? 'calendar headache started that day' : 'calendar headache started after 10am'}`,
  );
  printRiskRatios(rows, exposures, outcome);
}
