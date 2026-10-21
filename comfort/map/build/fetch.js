// Downloads hourly weather and air quality for every grid point.
//
//   node comfort/map/build/fetch.js [--days 7] [--start YYYY-MM-DD --end YYYY-MM-DD] [--step 0.5]
//
// Work is split into (month, batch of points) pieces, each saved to its own
// cache file as soon as it arrives, so an interrupted or rate-limited run picks
// up where it left off when started again.

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {
  AIR_QUALITY_URL,
  BATCH_SIZE,
  WEATHER_FIELDS,
  WEATHER_URL,
  batchDir,
  buildGrid,
  monthChunks,
  parseArgs,
  writeJson,
} from './common.js';

// Open-Meteo's free tier: 600 calls a minute, 5,000 an hour, 10,000 a day.
// Every location counts as a call, scaled up — fractionally — for more than
// ten variables or more than two weeks. Pacing to that, with headroom, means
// the limit is rarely hit at all.
const BUDGET_PER_MINUTE = 550;
const BUDGET_PER_HOUR = 4800;

const estimateWeight = (locations, variables, days) =>
  locations * Math.max(1, variables / 10) * Math.max(1, days / 14);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const spent = []; // [timestamp, weight]
async function pace(weight) {
  for (;;) {
    const now = Date.now();
    const within = (ms) =>
      spent.filter(([t]) => now - t < ms).reduce((sum, [, w]) => sum + w, 0);
    if (
      within(60_000) + weight <= BUDGET_PER_MINUTE &&
      within(3_600_000) + weight <= BUDGET_PER_HOUR
    )
      break;
    await sleep(5_000);
  }
  spent.push([Date.now(), weight]);
}

async function getJson(url, weight) {
  for (let attempt = 0; ; attempt++) {
    await pace(weight);
    let res;
    try {
      res = await fetch(url, {signal: AbortSignal.timeout(120_000)});
    } catch (error) {
      if (attempt >= 5) throw error;
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    if (res.ok) return res.json();

    const body = await res.text();
    if (res.status === 429) {
      if (/daily/i.test(body)) {
        console.error('\nDaily limit reached. Run again tomorrow to resume.');
        process.exit(2);
      }
      const wait = /hour/i.test(body) ? 10 * 60_000 : 65_000;
      console.log(`\nRate limited (${body.trim()}); waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (res.status >= 500 && attempt < 5) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${body}`);
  }
}

const coords = (points) =>
  `latitude=${points.map((p) => p.lat).join(',')}` +
  `&longitude=${points.map((p) => p.lon).join(',')}`;

// Single-location requests come back as an object rather than a list of one.
const asList = (data) => (Array.isArray(data) ? data : [data]);

// Keeps only what `process.js` reads; the rest of each response is noise.
const slim = (data) =>
  asList(data).map(({timezone, hourly}) => ({timezone, hourly}));

async function fetchBatch(points, {start, end}, days) {
  const range = `&start_date=${start}&end_date=${end}&timezone=auto`;
  const weather = await getJson(
    `${WEATHER_URL}?${coords(points)}${range}&hourly=${WEATHER_FIELDS.join(',')}` +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph',
    estimateWeight(points.length, WEATHER_FIELDS.length, days),
  );
  const air = await getJson(
    `${AIR_QUALITY_URL}?${coords(points)}${range}&hourly=us_aqi`,
    estimateWeight(points.length, 1, days),
  );
  return {weather: slim(weather), air: slim(air)};
}

const args = parseArgs();
const grid = await buildGrid(args.step);
const chunks = monthChunks(args.start, args.end);
const batches = [];
for (let i = 0; i < grid.points.length; i += BATCH_SIZE)
  batches.push(grid.points.slice(i, i + BATCH_SIZE));

console.log(
  `${grid.points.length} points at ${args.step}°, ${args.start} to ${args.end}: ` +
    `${chunks.length} month(s) × ${batches.length} batches`,
);

const total = chunks.length * batches.length;
let done = 0;
const started = Date.now();
for (const chunk of chunks) {
  const days =
    (Date.parse(chunk.end) - Date.parse(chunk.start)) / 86_400_000 + 1;
  // Keyed by the exact dates and grid, so overlapping runs reuse what they can
  // and a different range never mistakes another range's file for its own.
  const dir = batchDir(args.step, chunk);
  for (let b = 0; b < batches.length; b++) {
    const path = join(dir, `batch-${b}.json`);
    if (!existsSync(path)) {
      await writeJson(path, await fetchBatch(batches[b], chunk, days));
    }
    done++;
    const elapsed = (Date.now() - started) / 1000;
    process.stdout.write(
      `\r${chunk.month}: ${done}/${total} batches, ${Math.round(elapsed)}s`,
    );
  }
}
console.log('\nDone.');
