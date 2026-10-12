// Exertion or overheating? Looks at walks at any time of day and compares
// how often a calendar headache starts during the walk or within 3 hours
// after with how often one starts in the same clock-time window on days with
// no walk then (expected). Exertion predicts harder walks are worse in any
// weather; overheating predicts hot, muggy walks are worse at any pace.
//
// Walks are found as in humidWalks.js. Intensity is steps per minute for
// step-detected walks (2025-12-22 on) and km/h for Timeline walks (before),
// each split into thirds within its own source, so easy, medium, and hard
// mean the same rank in both.
// Usage: node health/analyze/exertion.js

import {query} from './stats.js';

const walks = await query(`
  WITH buckets AS (
    SELECT t, max(steps) AS steps FROM (
      SELECT time_bucket(INTERVAL 10 MINUTE, ts) AS t, device, sum(steps) AS steps
      FROM steps GROUP BY ALL
    ) GROUP BY ALL
  ),
  islands AS (
    SELECT t, steps, t - INTERVAL 10 MINUTE * row_number() OVER (ORDER BY t) AS grp
    FROM buckets WHERE steps >= 700
  ),
  all_walks AS (
    SELECT min(t) AS start, max(t) + INTERVAL 10 MINUTE AS "end", 'steps' AS source,
      sum(steps) / (count(*) * 10) AS intensity
    FROM islands GROUP BY grp HAVING count(*) >= 2
    UNION ALL
    SELECT start, "end", 'timeline', km / (epoch("end" - start) / 3600)
    FROM travel
    WHERE mode = 'walking' AND start < TIMESTAMP '2025-12-22'
      AND "end" - start BETWEEN INTERVAL 15 MINUTE AND INTERVAL 150 MINUTE
      AND km >= 1
      AND km / (epoch("end" - start) / 3600) BETWEEN 2.5 AND 8
  ),
  w AS (
    SELECT *, ntile(3) OVER (PARTITION BY source ORDER BY intensity) AS effort,
      epoch("end" - start) / 60 AS minutes,
      start::TIME AS t0, ("end" + INTERVAL 3 HOUR)::TIME AS t1
    FROM all_walks
    WHERE hour(start) BETWEEN 5 AND 20
      AND NOT EXISTS (SELECT 1 FROM headaches h
        WHERE h.start BETWEEN all_walks.start - INTERVAL 12 HOUR AND all_walks.start)
  ),
  -- Control days: no walk overlapping the window, no headache in the 12
  -- hours before it, within the walk data's date range.
  span AS (SELECT min(start)::DATE AS d0, max(start)::DATE AS d1 FROM w),
  expected AS (
    SELECT w.start,
      avg(CASE WHEN EXISTS (SELECT 1 FROM headaches h
          WHERE h.start BETWEEN d.day + w.t0 AND d.day + w.t1) THEN 1 ELSE 0 END) AS p
    FROM w, span, days d
    WHERE w.t1 > w.t0 AND d.day BETWEEN span.d0 AND span.d1
      AND NOT EXISTS (SELECT 1 FROM all_walks a
        WHERE a.start < d.day + w.t1 AND a."end" > d.day + w.t0)
      AND NOT EXISTS (SELECT 1 FROM headaches h
        WHERE h.start BETWEEN d.day + w.t0 - INTERVAL 12 HOUR AND d.day + w.t0)
    GROUP BY w.start
  )
  SELECT w.start, w.source, w.effort::INT AS effort, round(w.minutes) AS minutes,
    CASE WHEN hour(w.start) < 11 THEN '1 morning (5-11)'
      WHEN hour(w.start) < 16 THEN '2 midday (11-4)' ELSE '3 evening (4-9)' END AS time_of_day,
    (SELECT round(avg(temperature_2m) * 9 / 5 + 32) FROM weather x
      WHERE x.ts BETWEEN date_trunc('hour', w.start) AND w."end") AS temp_f,
    (SELECT round(avg(dew_point_2m) * 9 / 5 + 32) FROM weather x
      WHERE x.ts BETWEEN date_trunc('hour', w.start) AND w."end") AS dew_f,
    EXISTS (SELECT 1 FROM headaches h
      WHERE h.start BETWEEN w.start AND w."end" + INTERVAL 3 HOUR) AS hit,
    e.p AS expected
  FROM w JOIN expected e USING (start)
  ORDER BY w.start`);

// Observed vs expected headaches, with a rough 95% interval on the ratio
// (Poisson, log scale).
const compare = (label, groups) => {
  console.log(`\nBy ${label}:`);
  console.table(
    groups.map(([name, filter]) => {
      const g = walks.filter(filter);
      const obs = g.filter((w) => w.hit).length;
      const exp = g.reduce((s, w) => s + w.expected, 0);
      const ratio = obs / exp;
      const se = 1 / Math.sqrt(Math.max(obs, 0.5));
      return {
        [label]: name,
        walks: g.length,
        headaches: obs,
        expected: +exp.toFixed(1),
        ratio: obs ? +ratio.toFixed(1) : 0,
        '95% range': obs
          ? `${(ratio * Math.exp(-1.96 * se)).toFixed(1)}-${(ratio * Math.exp(1.96 * se)).toFixed(1)}`
          : '-',
      };
    }),
  );
};

console.log(
  `${walks.length} walks, ${walks[0].start.slice(0, 10)} to ${walks.at(-1).start.slice(0, 10)}`,
);
compare('all', [['all walks', () => true]]);
compare('time of day', [
  ['morning (5-11)', (w) => w.time_of_day.startsWith('1')],
  ['midday (11-4)', (w) => w.time_of_day.startsWith('2')],
  ['evening (4-9)', (w) => w.time_of_day.startsWith('3')],
]);
compare('effort', [
  ['easy', (w) => w.effort === 1],
  ['medium', (w) => w.effort === 2],
  ['hard', (w) => w.effort === 3],
]);
compare('weather', [
  ['cool (under 60F)', (w) => w.temp_f < 60],
  ['mild (60-74F)', (w) => w.temp_f >= 60 && w.temp_f < 75],
  ['hot (75F+)', (w) => w.temp_f >= 75],
  ['dry (dew under 60F)', (w) => w.dew_f < 60],
  ['muggy (dew 65F+)', (w) => w.dew_f >= 65],
]);
compare('effort and humidity', [
  ['easy/medium, dew under 60F', (w) => w.effort < 3 && w.dew_f < 60],
  ['hard, dew under 60F', (w) => w.effort === 3 && w.dew_f < 60],
  ['easy/medium, dew 65F+', (w) => w.effort < 3 && w.dew_f >= 65],
  ['hard, dew 65F+', (w) => w.effort === 3 && w.dew_f >= 65],
]);
