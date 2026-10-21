// Scores every waking hour at every grid point with the app's own comfort model
// and writes per-month aggregates for the page.
//
//   node comfort/map/build/process.js [same arguments as fetch.js]
//
// Imports `comfort.js` directly rather than copying it, so the map can never
// quietly disagree with the app about what comfortable means.

import {readFile, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {ACTIVITIES, scoreComfort} from '../../js/comfort.js';
import {
  ACTIVITY_KEYS,
  BATCH_SIZE,
  DATA_DIR,
  FACTORS,
  STAT_FIELDS,
  WEATHER_FIELDS,
  batchDir,
  buildGrid,
  monthChunks,
  parseArgs,
  writeJson,
} from './common.js';

// The same window the app's best-window search treats as walkable, in each
// point's own local time.
const WAKING_START_HOUR = 6;
const WAKING_END_HOUR = 22;
const GOOD_SCORE = 70; // bottom of the app's "Good" band

const args = parseArgs();
const grid = await buildGrid(args.step);
const chunks = monthChunks(args.start, args.end);
const months = chunks.map((chunk) => chunk.month);

const fieldCount = STAT_FIELDS.length;
const stride = ACTIVITY_KEYS.length * months.length * fieldCount;
const stats = new Uint32Array(grid.points.length * stride);
const factorOffset = STAT_FIELDS.indexOf(FACTORS[0]);

// The factor that cost the most. The model's own limiter is preferred, but it
// stays silent below its notability floor, and an hour that missed Good still
// has to be charged to something.
function blame({penalties, limiter}) {
  if (limiter) return limiter;
  let worst = null;
  for (const [key, value] of Object.entries(penalties))
    if (!worst || value > penalties[worst]) worst = key;
  return worst;
}

function scorePoint(index, weather, air, monthIndex) {
  const aqiByTime = new Map(
    air.hourly.time.map((time, i) => [time, air.hourly.us_aqi[i]]),
  );
  const {hourly} = weather;
  for (let h = 0; h < hourly.time.length; h++) {
    const time = hourly.time[h];
    const hour = Number(time.slice(11, 13));
    if (hour < WAKING_START_HOUR || hour >= WAKING_END_HOUR) continue;

    const row = {us_aqi: aqiByTime.get(time) ?? null};
    for (const field of WEATHER_FIELDS) row[field] = hourly[field][h];
    if (!Number.isFinite(row.temperature_2m)) continue;

    ACTIVITY_KEYS.forEach((key, a) => {
      const result = scoreComfort(row, {activity: ACTIVITIES[key]});
      const base =
        index * stride + (a * months.length + monthIndex) * fieldCount;
      stats[base] += 1;
      stats[base + 2] += result.score;
      if (result.score >= GOOD_SCORE) {
        stats[base + 1] += 1;
      } else {
        stats[base + factorOffset + FACTORS.indexOf(blame(result))] += 1;
      }
    });
  }
}

let missing = 0;
for (const [monthIndex, chunk] of chunks.entries()) {
  const dir = batchDir(args.step, chunk);
  for (let first = 0; first < grid.points.length; first += BATCH_SIZE) {
    const path = join(dir, `batch-${first / BATCH_SIZE}.json`);
    if (!existsSync(path)) {
      missing++;
      continue;
    }
    const {weather, air} = JSON.parse(await readFile(path, 'utf8'));
    weather.forEach((w, i) => scorePoint(first + i, w, air[i], monthIndex));
  }
  process.stdout.write(`\rScored ${chunk.month}`);
}
if (missing) console.warn(`\n${missing} batches not fetched yet; left empty.`);

// A month has at most 496 waking hours, so even the score sum (49,600 at most)
// fits in 16 bits.
await writeFile(join(DATA_DIR, 'stats.bin'), Uint16Array.from(stats));
await writeJson(join(DATA_DIR, 'meta.json'), {
  start: args.start,
  end: args.end,
  step: grid.step,
  cols: grid.cols,
  rows: grid.rows,
  bounds: grid.bounds,
  months,
  activities: ACTIVITY_KEYS,
  fields: STAT_FIELDS,
  goodScore: GOOD_SCORE,
  wakingHours: [WAKING_START_HOUR, WAKING_END_HOUR],
  // Flat [row, col, row, col, …]: the stats are in the same order.
  cells: grid.points.flatMap((p) => [p.row, p.col]),
});
console.log(
  `\nWrote ${grid.points.length} points × ${months.length} month(s).`,
);
