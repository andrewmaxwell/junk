// What goes with insomnia? An insomnia night has a CPAP mask-off between 3
// and 6am followed by 30+ minutes awake (see cpap_sleep in schema.sql).
// Compares nights within the same calendar month, so seasons and slow
// changes (meds, surgeries) can't masquerade as effects.
// Usage: node health/analyze/earlyWaking.js

import {printRiskRatios, query} from './stats.js';

const nights = await query(`
  WITH d AS (
    SELECT *,
      lag(tags) OVER w AS tags_yday,
      lag(energy) OVER w AS energy_yday,
      lag(exercise) OVER w AS exercise_yday,
      lag(outdoor_temp_max) OVER w AS temp_max_yday,
      lag(drive_min) OVER w AS drive_min_yday,
      lag(hours_out) OVER w AS hours_out_yday,
      lag(places_visited) OVER w AS places_yday
    FROM days WINDOW w AS (ORDER BY day)
  ),
  medians AS (
    SELECT median(ahi) AS ahi, median(central_ai) AS cai, median(leak_95) AS leak,
      median(bedroom_co2_avg) AS co2, median(bedroom_temp_c) AS temp,
      median(bedroom_humidity) AS humidity
    FROM days
  ),
  overnight AS (
    SELECT night_day(ts) AS day, min(temperature_2m) AS outdoor_low,
      max(pressure_msl) - min(pressure_msl) AS pressure_range
    FROM weather WHERE hour(ts) >= 21 OR hour(ts) < 7 GROUP BY ALL
  )
  SELECT
    d.day, strftime(d.day, '%Y-%m') AS stratum,
    d.insomnia,
    d.energy_yday <= 3 OR list_has_any(d.tags_yday, ['tired', 'sleepy_day', 'woke_tired']) AS tired_evening,
    d.bedtime::TIME BETWEEN TIME '12:00' AND TIME '21:59' AS bed_before_10pm,
    d.bedtime::TIME >= TIME '23:00' OR d.bedtime::TIME < TIME '12:00' AS bed_after_11pm,
    dayname(d.day - 1) IN ('Friday', 'Saturday') AS weekend_night,
    d.ahi > m.ahi AS ahi_above_median,
    d.central_ai > m.cai AS central_above_median,
    d.leak_95 > m.leak AS leak_above_median,
    d.bedroom_co2_avg > m.co2 AS co2_above_median,
    d.bedroom_temp_c > m.temp AS bedroom_warm,
    d.bedroom_humidity > m.humidity AS bedroom_humid,
    o.outdoor_low >= 20 AS warm_night,
    d.temp_max_yday >= 32 AS hot_day_before,
    o.pressure_range >= 4 AS pressure_moving,
    d.headache_events > 0 AND d.headache_first_time < TIME '08:00' AS morning_headache,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_has_any(d.tags_yday, ['stressed', 'anxious', 'low_mood', 'irritable']) END AS stressed_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_contains(d.tags_yday, 'coffee') END AS extra_caffeine_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_has_any(d.tags_yday, ['nap', 'sleepy_day']) END AS napped_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_has_any(d.tags_yday, ['social', 'church']) END AS social_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_contains(d.tags_yday, 'screens') END AS screens_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN d.exercise_yday >= 4 END AS exercised_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN d.energy_yday <= 2 END AS low_energy_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN d.energy_yday <= 3 END AS energy_3_or_less_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_has_any(d.tags_yday, ['tired', 'sleepy_day', 'woke_tired']) END AS tired_noted_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_has_any(d.tags_yday, ['away', 'travel']) END AS away_yday,
    CASE WHEN d.energy_yday IS NOT NULL THEN list_contains(d.tags_yday, 'sick') END AS sick_yday,
    d.slept_km_from_home >= 50 AS slept_away,
    d.tz_shift_h <> 0 AS other_time_zone,
    d.drive_min_yday >= 180 AS long_drive_yday,
    d.hours_out_yday >= 10 AS long_day_out_yday,
    d.hours_out_yday < 1 AS stayed_home_yday,
    d.places_yday >= 4 AS many_places_yday
  FROM d
  CROSS JOIN medians m
  LEFT JOIN overnight o USING (day)
  WHERE d.final_wake IS NOT NULL
`);

const exposures = [
  ['bed_before_10pm', 'Bedtime (mask on) before 10pm'],
  ['bed_after_11pm', 'Bedtime 11pm or later'],
  ['weekend_night', 'Friday or Saturday night'],
  ['ahi_above_median', 'AHI above median'],
  ['central_above_median', 'Central apnea index above median'],
  ['leak_above_median', 'Mask leak (95th pct) above median'],
  ['co2_above_median', 'Bedroom CO2 above median (Aranet nights only)'],
  ['bedroom_warm', 'Bedroom temperature above median (Aranet nights only)'],
  ['bedroom_humid', 'Bedroom humidity above median (Aranet nights only)'],
  ['warm_night', 'Outdoor overnight low >= 20C/68F'],
  ['hot_day_before', 'Outdoor high >= 32C/90F the day before'],
  ['pressure_moving', 'Air pressure moved 4+ hPa overnight'],
  ['morning_headache', 'Headache started before 8am'],
  ['stressed_yday', 'Stressed, anxious, low or irritable the day before'],
  ['extra_caffeine_yday', 'Caffeine noted the day before'],
  ['napped_yday', 'Napped or sleepy the day before'],
  ['social_yday', 'Social or church the day before'],
  ['screens_yday', 'TV/YouTube noted the day before'],
  ['exercised_yday', 'Exercise rated 4-5 the day before'],
  ['low_energy_yday', 'Energy rated 1-2 the day before'],
  ['energy_3_or_less_yday', 'Energy rated 1-3 the day before'],
  ['tired_noted_yday', 'Tired or sleepy noted the day before'],
  ['sick_yday', 'Sick the day before'],
  ['away_yday', 'Traveling or away'],
  ['slept_away', 'Location: slept 50+ km from home'],
  ['other_time_zone', 'Location: outside the home time zone'],
  ['long_drive_yday', 'Location: 3+ hours in a car the day before'],
  ['long_day_out_yday', 'Location: 10+ hours away from home the day before'],
  ['stayed_home_yday', 'Location: under 1 hour away from home the day before'],
  ['many_places_yday', 'Location: 4+ places visited the day before'],
];

console.log(
  `Insomnia: ${nights.filter((r) => r.insomnia).length} of ${nights.length} nights\n`,
);
printRiskRatios(nights, exposures, 'insomnia', 'nights');

// Tired evenings and early bedtimes go together, so look at each
// combination separately.
console.log('\nInsomnia rate by evening tiredness and bedtime:');
console.table(
  [true, false].flatMap((tired) =>
    [true, false].map((early) => {
      const group = nights.filter(
        (r) => r.tired_evening === tired && r.bed_before_10pm === early,
      );
      return {
        evening: tired ? 'tired' : 'not tired',
        bedtime: early ? 'before 10pm' : '10pm or later',
        nights: group.length,
        insomnia: `${Math.round((100 * group.filter((r) => r.insomnia).length) / group.length)}%`,
      };
    }),
  ),
);

// For nights with detailed CPAP data: were breathing events or leaks more
// common just before waking than earlier in the night?
const detail = await query(`
  WITH wakes AS (
    -- Every mask-off after midnight: mid-night wakes and the final wake.
    SELECT s."end" AS wake, d.bedtime,
      CASE WHEN s."end" = d.insomnia_wake THEN 'insomnia wake (3-6am, 30+ min)'
        WHEN s."end" = d.final_wake THEN 'normal final wake'
        ELSE 'other mid-night mask-off' END AS kind
    FROM cpap_sessions s JOIN days d ON d.day = night_day(s."end")
    WHERE hour(s."end") < 9 AND s."end" > (SELECT min(ts) FROM cpap_events)
      AND d.bedtime IS NOT NULL
  )
  SELECT kind, count(DISTINCT w.wake) AS wakes,
    round(60.0 * count(e.ts) FILTER (WHERE e.ts >= w.wake - INTERVAL 30 MINUTE) / (30 * count(DISTINCT w.wake)), 1) AS events_per_hour_last_30_min,
    round(avg((SELECT avg(leak) FROM cpap_minutes c WHERE c.ts BETWEEN w.wake - INTERVAL 15 MINUTE AND w.wake - INTERVAL 2 MINUTE)), 3) AS leak_last_15_min,
    round(avg((SELECT avg(flow_lim) FROM cpap_minutes c WHERE c.ts BETWEEN w.wake - INTERVAL 15 MINUTE AND w.wake - INTERVAL 2 MINUTE)), 3) AS flow_lim_last_15_min
  FROM wakes w
  LEFT JOIN cpap_events e ON e.ts BETWEEN w.wake - INTERVAL 30 MINUTE AND w.wake
  GROUP BY kind ORDER BY kind
`);
const [baseline] = await query(`
  SELECT round(3600.0 * (SELECT count(*) FROM cpap_events)
      / (SELECT sum(date_diff('second', start, "end")) FROM cpap_sessions WHERE start >= (SELECT min(ts) FROM cpap_events)), 1) AS events_per_hour,
    round((SELECT avg(leak) FROM cpap_minutes), 3) AS leak,
    round((SELECT avg(flow_lim) FROM cpap_minutes), 3) AS flow_lim
`);
console.log(
  `\nJust before waking (detailed CPAP nights). Whole-night baseline: ${baseline.events_per_hour} events/hour, leak ${baseline.leak} L/s, flow limitation ${baseline.flow_lim}`,
);
console.table(detail);
