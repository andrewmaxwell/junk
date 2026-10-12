// Do morning walks on muggy days bring on headaches? Andrew's overheating
// migraines come within an hour or two of getting sweaty, lately after
// morning walks on very humid days.
//
// Walks come from phone and watch steps from 2025-12-22 (10-minute buckets
// with 700+ steps, 20+ minutes in a row), and before that from Timeline
// walking segments (15-150 minutes, 1+ km, at walking speed). A morning walk
// starts 5-11am. The outcome is a calendar headache (ones that hurt) starting
// during the walk or within 3 hours after; days with a headache in the 12
// hours before the walk are left out. Weather is averaged over the walk.
// Usage: node health/analyze/humidWalks.js

import {query} from './stats.js';

const walks = await query(`
  WITH buckets AS (
    SELECT time_bucket(INTERVAL 10 MINUTE, ts) AS t, max(steps) AS steps
    FROM (
      SELECT time_bucket(INTERVAL 10 MINUTE, ts) AS ts, device, sum(steps) AS steps
      FROM steps GROUP BY ALL
    ) GROUP BY ALL
  ),
  islands AS (
    SELECT t, t - INTERVAL 10 MINUTE * row_number() OVER (ORDER BY t) AS grp
    FROM buckets WHERE steps >= 700
  ),
  step_walks AS (
    SELECT min(t) AS start, max(t) + INTERVAL 10 MINUTE AS "end", 'steps' AS source
    FROM islands GROUP BY grp HAVING count(*) >= 2
  ),
  timeline_walks AS (
    SELECT start, "end", 'timeline' AS source
    FROM travel
    WHERE mode = 'walking' AND start < TIMESTAMP '2025-12-22'
      AND "end" - start BETWEEN INTERVAL 15 MINUTE AND INTERVAL 150 MINUTE
      AND km >= 1
      AND km / (epoch("end" - start) / 3600) BETWEEN 2.5 AND 8
  ),
  morning AS (
    SELECT start::DATE AS day, min(start) AS start, max("end") AS "end",
      sum(epoch("end" - start) / 60)::INT AS walk_min, any_value(source) AS source
    FROM (FROM step_walks UNION ALL FROM timeline_walks)
    WHERE hour(start) BETWEEN 5 AND 10
    GROUP BY ALL
  )
  SELECT m.day, m.start, m.walk_min, m.source,
    round(avg(w.temperature_2m) * 9 / 5 + 32) AS temp_f,
    round(avg(w.dew_point_2m) * 9 / 5 + 32) AS dew_f,
    round(avg(w.apparent_temperature) * 9 / 5 + 32) AS feels_f,
    round(avg(w.relative_humidity_2m)) AS rh,
    (SELECT min(h.start) FROM headaches h
     WHERE h.start BETWEEN m.start AND m."end" + INTERVAL 3 HOUR) AS headache_at,
    (SELECT h.title FROM headaches h
     WHERE h.start BETWEEN m.start AND m."end" + INTERVAL 3 HOUR LIMIT 1) AS headache_title,
    j.headache AS journal_headache, j.notes
  FROM morning m
  JOIN weather w ON w.ts BETWEEN date_trunc('hour', m.start) AND m."end"
  LEFT JOIN journal j ON j.day = m.day
  WHERE NOT EXISTS (SELECT 1 FROM headaches h
    WHERE h.start BETWEEN m.start - INTERVAL 12 HOUR AND m.start)
  GROUP BY ALL ORDER BY m.day`);

// Base rate: on days with no morning walk, how often a headache starts
// 8am-noon, a window about as long as a walk plus 3 hours.
const [base] = await query(`
  SELECT count(*) AS days, count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM headaches h
      WHERE h.start BETWEEN d.day + INTERVAL 8 HOUR AND d.day + INTERVAL 12 HOUR)) AS hits
  FROM days d
  WHERE d.day BETWEEN (SELECT min(day) FROM (VALUES ${walks.map((w) => `(DATE '${w.day}')`).join(',')}) t(day)) AND current_date
    AND d.day NOT IN (${walks.map((w) => `DATE '${w.day}'`).join(',')})
    AND NOT EXISTS (SELECT 1 FROM headaches h
      WHERE h.start BETWEEN d.day - INTERVAL 4 HOUR AND d.day + INTERVAL 8 HOUR)`);

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '-');
const table = (label, key, bins) => {
  console.log(`\nBy ${label}:`);
  const rows = bins.map(([name, lo, hi]) => {
    const group = walks.filter((w) => w[key] >= lo && w[key] < hi);
    const hits = group.filter((w) => w.headache_at).length;
    return {
      [label]: name,
      walks: group.length,
      headaches: hits,
      rate: pct(hits, group.length),
    };
  });
  console.table(rows);
};

const hits = walks.filter((w) => w.headache_at);
console.log(
  `${walks.length} morning walks (${walks[0].day} to ${walks.at(-1).day}), ${hits.length} followed by a headache within 3 hours: ${pct(hits.length, walks.length)}`,
);
console.log(
  `Base rate, no-walk mornings, headache starting 8am-noon: ${base.hits}/${base.days} = ${pct(base.hits, base.days)}`,
);
table('dew point °F', 'dew_f', [
  ['under 50', -99, 50],
  ['50-59', 50, 60],
  ['60-64', 60, 65],
  ['65-69', 65, 70],
  ['70+', 70, 999],
]);
table('temperature °F', 'temp_f', [
  ['under 60', -99, 60],
  ['60-69', 60, 70],
  ['70-79', 70, 80],
  ['80+', 80, 999],
]);
table('walk length', 'walk_min', [
  ['under 40 min', 0, 40],
  ['40-59 min', 40, 60],
  ['60+ min', 60, 9999],
]);

console.log('\nWalks followed by a headache:');
console.table(
  hits.map((w) => ({
    walk: w.start.slice(0, 16),
    min: w.walk_min,
    headache: w.headache_at.slice(11, 16),
    temp_f: w.temp_f,
    dew_f: w.dew_f,
    rh: w.rh,
    title: w.headache_title,
  })),
);
