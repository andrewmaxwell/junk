// Morning headaches on Mondays, and whether fast food the day before matters.
// Started as a fast food question: fast food the day before looked like it
// doubled morning headaches, but much of it was Sunday fast food followed by
// a Monday, and Mondays have about twice the morning headaches anyway.
// Home days only (trips change sleep, caffeine, food, and exertion at once).
// Food comes from the journal note the day before, written before the
// headache. The fast_food tag only exists for tagged notes (data/tags/).
// Usage: node health/analyze/mondays.js

import {mantelHaenszel, query} from './stats.js';

const rows = await query(`
  WITH d AS (
    SELECT *, lag(tags) OVER w AS tags_yday, lag(energy) OVER w AS energy_yday
    FROM days WINDOW w AS (ORDER BY day)
  )
  SELECT day, year(day)::INT AS year, dayofweek(day)::INT AS weekday,
    headache_events > 0 AND headache_first_time < '12:00' AS morning,
    headache_events > 0 AND headache_first_time >= '12:00' AS later,
    list_contains(tags_yday, 'fast_food') AS fast_food
  FROM d
  WHERE day >= DATE '2022-04-02' AND energy_yday IS NOT NULL
    AND day <= (SELECT max(day) FROM note_tags) + 1
    AND NOT coalesce(slept_km_from_home >= 50, false)
    AND NOT list_has_any(coalesce(tags, []), ['away', 'travel'])
    AND NOT list_has_any(coalesce(tags_yday, []), ['away', 'travel'])
`);
for (const r of rows) r.monday = r.weekday === 1;

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const show = (label, subset, exposure, outcome, stratum) => {
  const r = mantelHaenszel(
    subset.map((row) => ({...row, stratum: stratum(row)})),
    exposure,
    outcome,
  );
  console.log(
    label.padEnd(52),
    String(r.exposedRows).padStart(4),
    pct(r.exposedRate).padStart(5),
    pct(r.otherRate).padStart(5),
    ` ${r.rr.toFixed(2)} (${r.low.toFixed(2)}-${r.high.toFixed(2)})`,
  );
};

console.log('Headache before noon, home days, by weekday of the morning:');
const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
for (const [i, name] of names.entries()) {
  const s = rows.filter((r) => r.weekday === i);
  console.log(
    `  ${name} ${pct(s.filter((r) => r.morning).length / s.length)} of ${s.length}`,
  );
}

console.log('\n'.padEnd(53), 'days  rate    vs   RR  (95% CI)');
show(
  'Monday morning, matched on year and fast food',
  rows,
  'monday',
  'morning',
  (r) => r.year + String(r.fast_food),
);
show('Monday, headache noon or later', rows, 'monday', 'later', (r) => r.year);
show(
  'Fast food the day before, matched on month',
  rows,
  'fast_food',
  'morning',
  (r) => r.day.slice(0, 7),
);
show(
  'Fast food, matched on year and weekday',
  rows,
  'fast_food',
  'morning',
  (r) => r.year + '-' + r.weekday,
);
show(
  'Fast food Sunday -> Monday morning',
  rows.filter((r) => r.monday),
  'fast_food',
  'morning',
  (r) => r.year,
);
show(
  'Fast food other days -> next morning',
  rows.filter((r) => !r.monday),
  'fast_food',
  'morning',
  (r) => r.year,
);
