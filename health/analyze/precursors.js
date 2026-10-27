// Looks for anything unusual before headaches, across every measure at once.
//
// Part 1, the day and night before a morning headache (calendar onset before
// noon): each measure is taken as its deviation from Andrew's own median over
// the previous 28 days, so slow changes (meds, CPAP, seasons) drop out. The
// mean deviation before headache mornings is compared with other mornings,
// and p comes from shuffling headache labels within each calendar month.
// Mornings right after a headache day are left out, since that headache
// colors the journal and sleep. Sleep measures can also be effects of a
// headache that starts in the night, so they're marked.
//
// Part 2, the hours before onset (time-stratified case-crossover): hourly
// weather and air at home at each headache's onset hour, minus the average of
// the same weekday and clock hour on the other weeks of that month. Home
// days only, since trip weather is daily.
//
// Many measures are tested, so q is the Benjamini-Hochberg false discovery
// rate: q < 0.1 means about 1 in 10 such hits would be noise.
// Usage: node health/analyze/precursors.js

import {query} from './stats.js';

const night = 'sleep (could be an effect)';
const measures = [
  // [column, label, group]
  ['energy_yday', 'Energy the day before', 'journal'],
  ['mood_yday', 'Mood the day before', 'journal'],
  ['anxiety_yday', 'Anxiety the day before', 'journal'],
  ['exercise_yday', 'Exercise the day before', 'journal'],
  ['steps_yday', 'Steps the day before', 'activity'],
  ['hours_out_yday', 'Hours out of the house the day before', 'activity'],
  ['places_yday', 'Places visited the day before', 'activity'],
  ['drive_yday', 'Driving minutes the day before', 'activity'],
  ['temp_max_yday', 'Outdoor high the day before', 'weather'],
  ['dew_point_yday', 'Dew point the day before', 'weather'],
  ['pressure_yday', 'Pressure the day before', 'weather'],
  ['precip_yday', 'Rain the day before', 'weather'],
  ['cloud_yday', 'Cloud cover the day before', 'weather'],
  ['aqi_yday', 'Max AQI the day before', 'weather'],
  ['pm25_yday', 'PM2.5 the day before', 'weather'],
  ['ozone_yday', 'Ozone the day before', 'weather'],
  ['indoor_co2_yday', 'Indoor CO2 the day before', 'air'],
  ['outdoor_temp_min', 'Overnight low', 'weather'],
  ['pressure_change_24h', 'Pressure change, 24 h to 8am', 'weather'],
  ['bed_hour', 'Bedtime (hours after 6pm)', 'sleep'],
  ['bedroom_co2_avg', 'Bedroom CO2', 'air'],
  ['bedroom_temp_c', 'Bedroom temperature', 'air'],
  ['bedroom_humidity', 'Bedroom humidity', 'air'],
  ['resting_hr', 'Resting heart rate', 'Fitbit'],
  ['hrv_ms', 'HRV', 'Fitbit'],
  ['spo2_avg', 'SpO2', 'Fitbit'],
  ['breathing_rate', 'Breathing rate (Fitbit)', 'Fitbit'],
  ['skin_temp_deviation_c', 'Skin temperature', 'Fitbit'],
  ['ahi', 'AHI', 'CPAP'],
  ['central_ai', 'Central apneas per hour', 'CPAP'],
  ['obstructive_ai', 'Obstructive apneas per hour', 'CPAP'],
  ['leak_95', 'Mask leak (95th percentile)', 'CPAP'],
  ['cpap_resp_rate', 'Breathing rate (CPAP)', 'CPAP'],
  ['cpap_arousals', 'Arousals', 'CPAP'],
  ['cpap_usage_min', 'Mask-on minutes', night],
  ['awake_mid_night_min', 'Awake mid-night (CPAP)', night],
  ['wake_hour', 'Up for the day (hours after 6pm)', night],
  ['minutes_asleep', 'Minutes asleep (Fitbit)', night],
  ['deep_min', 'Deep sleep', night],
  ['rem_min', 'REM sleep', night],
  ['fitbit_awake_in_bed_min', 'Awake in bed (Fitbit)', night],
];

const rows = await query(`
  WITH d AS (
    SELECT *,
      lag(headache_events) OVER w > 0 AS headache_yday,
      lag(energy) OVER w AS energy_yday, lag(mood) OVER w AS mood_yday,
      lag(anxiety) OVER w AS anxiety_yday, lag(exercise) OVER w AS exercise_yday,
      lag(steps) OVER w AS steps_yday, lag(hours_out) OVER w AS hours_out_yday,
      lag(places_visited) OVER w AS places_yday, lag(drive_min) OVER w AS drive_yday,
      lag(outdoor_temp_max) OVER w AS temp_max_yday, lag(dew_point) OVER w AS dew_point_yday,
      lag(pressure_avg) OVER w AS pressure_yday, lag(precip_mm) OVER w AS precip_yday,
      lag(cloud_cover) OVER w AS cloud_yday, lag(aqi_max) OVER w AS aqi_yday,
      lag(pm25) OVER w AS pm25_yday, lag(ozone_max) OVER w AS ozone_yday,
      lag(indoor_co2_day_avg) OVER w AS indoor_co2_yday
    FROM days WINDOW w AS (ORDER BY day)
  )
  SELECT *, strftime(day, '%Y-%m') AS month,
    headache_events > 0 AND headache_first_time < TIME '12:00' AS morning,
    epoch(bedtime - (day - 1 + TIME '18:00')) / 3600 AS bed_hour,
    epoch(final_wake - (day - 1 + TIME '18:00')) / 3600 AS wake_hour
  FROM d
  WHERE day BETWEEN DATE '2021-08-28' AND current_date - 1
`);

// Benjamini-Hochberg q-values, in the input order.
const fdr = (ps) => {
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = [];
  let min = 1;
  for (let k = order.length - 1; k >= 0; k--) {
    min = Math.min(min, (order[k][0] * order.length) / (k + 1));
    q[order[k][1]] = min;
  }
  return q;
};

// Part 1
const results = [];
for (const [key, label, group] of measures) {
  // Deviation from the median of the previous 28 days (at least 7 values).
  const series = [];
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][key] == null ? null : Number(rows[i][key]);
    const past = rows
      .slice(Math.max(0, i - 28), i)
      .map((r) => r[key])
      .filter((x) => x != null)
      .map(Number)
      .sort((a, b) => a - b);
    if (v == null || past.length < 7 || rows[i].headache_yday) continue;
    const median = past[Math.floor(past.length / 2)];
    series.push({
      dev: v - median,
      morning: rows[i].morning,
      month: rows[i].month,
    });
  }
  const cases = series.filter((s) => s.morning);
  if (cases.length < 8) continue;
  const meanDiff = (labels) => {
    let a = 0;
    let na = 0;
    let b = 0;
    for (let i = 0; i < series.length; i++) {
      if (labels[i]) {
        a += series[i].dev;
        na++;
      } else b += series[i].dev;
    }
    return a / na - b / (series.length - na);
  };
  const observed = meanDiff(series.map((s) => s.morning));
  const byMonth = Map.groupBy(
    series.map((s, i) => i),
    (i) => series[i].month,
  );
  let extreme = 0;
  const perms = 2000;
  for (let k = 0; k < perms; k++) {
    const labels = [];
    for (const idx of byMonth.values()) {
      const shuffled = idx.map((i) => series[i].morning);
      for (let j = shuffled.length - 1; j > 0; j--) {
        const r = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[r]] = [shuffled[r], shuffled[j]];
      }
      idx.forEach((i, j) => (labels[i] = shuffled[j]));
    }
    if (Math.abs(meanDiff(labels)) >= Math.abs(observed)) extreme++;
  }
  const sd = Math.sqrt(
    series.reduce((s, x) => s + x.dev ** 2, 0) / series.length,
  );
  results.push({
    label,
    group,
    cases: cases.length,
    nights: series.length,
    diff: observed,
    sds: observed / sd,
    p: (extreme + 1) / (perms + 1),
  });
}
fdr(results.map((r) => r.p)).forEach((q, i) => (results[i].q = q));

const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(2));
console.log(
  'Part 1: the day and night before a morning headache, vs your own last 28 days',
);
console.log(
  'Measure'.padEnd(40),
  'group'.padEnd(26),
  'cases'.padStart(5),
  'of'.padStart(5),
  'diff'.padStart(7),
  '  SD',
  '    p',
  '    q',
);
for (const r of results.sort((a, b) => a.p - b.p)) {
  console.log(
    r.label.padEnd(40),
    r.group.padEnd(26),
    String(r.cases).padStart(5),
    String(r.nights).padStart(5),
    fmt(r.diff).padStart(7),
    r.sds.toFixed(2).padStart(5),
    r.p.toFixed(3).padStart(6),
    r.q.toFixed(2).padStart(5),
  );
}

// Part 2
const hourly = [
  ['dp3', 'Pressure change over 3 h (hPa)'],
  ['dp6', 'Pressure change over 6 h (hPa)'],
  ['dp12', 'Pressure change over 12 h (hPa)'],
  ['dp24', 'Pressure change over 24 h (hPa)'],
  ['pressure', 'Pressure (hPa)'],
  ['temp', 'Temperature (C)'],
  ['dt6', 'Temperature change over 6 h (C)'],
  ['dew', 'Dew point (C)'],
  ['feels', 'Feels-like temperature (C)'],
  ['rh', 'Relative humidity (%)'],
  ['gust', 'Wind gusts (km/h)'],
  ['rain6', 'Rain in the past 6 h (mm)'],
  ['cloud', 'Cloud cover (%)'],
  ['sun', 'Sunshine (W/m2)'],
  ['aqi', 'US AQI'],
  ['pm25', 'PM2.5 (ug/m3)'],
  ['ozone', 'Ozone (ug/m3)'],
  ['no2', 'NO2 (ug/m3)'],
];
const pairs = await query(`
  WITH w AS (
    SELECT ts, pressure_msl AS pressure, temperature_2m AS temp, dew_point_2m AS dew,
      apparent_temperature AS feels, relative_humidity_2m AS rh, wind_gusts_10m AS gust,
      cloud_cover AS cloud, shortwave_radiation AS sun,
      pressure_msl - lag(pressure_msl, 3) OVER o AS dp3,
      pressure_msl - lag(pressure_msl, 6) OVER o AS dp6,
      pressure_msl - lag(pressure_msl, 12) OVER o AS dp12,
      pressure_msl - lag(pressure_msl, 24) OVER o AS dp24,
      temperature_2m - lag(temperature_2m, 6) OVER o AS dt6,
      sum(precipitation) OVER (o ROWS 5 PRECEDING) AS rain6
    FROM weather WHERE place = 'home' WINDOW o AS (ORDER BY ts)
  ),
  a AS (
    SELECT ts, us_aqi AS aqi, pm2_5 AS pm25, ozone, nitrogen_dioxide AS no2
    FROM outdoor_air WHERE place = 'home'
  ),
  cases AS (
    SELECT DISTINCT date_trunc('hour', h.start) AS t
    FROM headaches h JOIN days d ON d.day = h.start::DATE
    WHERE coalesce(d.slept_km_from_home, 0) < 50
      AND NOT list_has_any(d.tags, ['away', 'travel'])
  ),
  refs AS (
    SELECT t, t + INTERVAL 7 DAY * k AS r
    FROM cases, range(-4, 5) AS k(k)
    WHERE k <> 0 AND month(t + INTERVAL 7 DAY * k) = month(t)
  )
  SELECT c.t, ${hourly.map(([k]) => `cw.${k} AS case_${k}`).join(', ')},
    ${hourly.map(([k]) => `avg(rw.${k}) AS ref_${k}`).join(', ')}
  FROM refs
  JOIN (SELECT t, w.*, a.* EXCLUDE (ts) FROM cases c JOIN w ON w.ts = c.t LEFT JOIN a ON a.ts = c.t) cw
    ON cw.t = refs.t
  JOIN (SELECT w.*, a.* EXCLUDE (ts) FROM w LEFT JOIN a USING (ts)) rw ON rw.ts = refs.r
  JOIN (SELECT DISTINCT t FROM cases) c ON c.t = refs.t
  GROUP BY ALL
`);
const out = hourly.map(([k, label]) => {
  const diffs = pairs
    .filter((p) => p[`case_${k}`] != null && p[`ref_${k}`] != null)
    .map((p) => p[`case_${k}`] - p[`ref_${k}`]);
  const n = diffs.length;
  const mean = diffs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(
    diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1),
  );
  const z = mean / (sd / Math.sqrt(n));
  // Two-sided normal p (n is in the hundreds).
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  return {label, n, mean, sd, p};
});
fdr(out.map((r) => r.p)).forEach((q, i) => (out[i].q = q));
console.log(
  '\nPart 2: hourly weather and air at onset, vs the same weekday and hour on other weeks of that month (home only)',
);
console.log(
  'Measure'.padEnd(36),
  '   n',
  '  diff',
  '  (SD of diffs)',
  '    p',
  '    q',
);
for (const r of out.sort((a, b) => a.p - b.p)) {
  console.log(
    r.label.padEnd(36),
    String(r.n).padStart(4),
    r.mean.toFixed(2).padStart(6),
    `  (${r.sd.toFixed(1)})`.padEnd(15),
    r.p.toFixed(3).padStart(6),
    r.q.toFixed(2).padStart(5),
  );
}

function normalCdf(x) {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * (x / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-((x / Math.SQRT2) ** 2));
  return 0.5 * (1 + y);
}
