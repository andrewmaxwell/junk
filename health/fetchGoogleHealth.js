// Downloads Google Health API (Fitbit / Pixel Watch) data into data/google/.
// Usage: node health/fetchGoogleHealth.js [--since 2024-01] [--types sleep,heart-rate]
// Setup steps are in README.md.

import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {dataDir, googleGet} from './googleAuth.js';

const outDir = join(dataDir, 'google');

const api = 'https://health.googleapis.com/v4/users/me/dataTypes';

// The time field each kind of data type is filtered on. Filters take civil
// (local) times, so months line up with the journal's local dates.
const filterFields = {
  interval: 'interval.civil_start_time',
  sample: 'sample_time.civil_time',
  daily: 'date',
  session: 'interval.civil_start_time',
  sleep: 'interval.civil_end_time',
};

// Types that support `list`. floors, active-minutes, time-in-heart-rate-zone,
// and daily-heart-rate-zones only support rollUp, and symptoms and moods are
// write-only, so they're left out.
const dataTypes = {
  sleep: 'sleep',
  exercise: 'session',
  'heart-rate': 'sample',
  'heart-rate-variability': 'sample',
  'oxygen-saturation': 'sample',
  'respiratory-rate-sleep-summary': 'sample',
  'core-body-temperature': 'sample',
  weight: 'sample',
  'body-fat': 'sample',
  'daily-resting-heart-rate': 'daily',
  'daily-heart-rate-variability': 'daily',
  'daily-oxygen-saturation': 'daily',
  'daily-respiratory-rate': 'daily',
  'daily-sleep-temperature-derivations': 'daily',
  'daily-vo2-max': 'daily',
  steps: 'interval',
  distance: 'interval',
  'active-zone-minutes': 'interval',
  'activity-level': 'interval',
  'sedentary-period': 'interval',
  'active-energy-burned': 'interval',
};

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const fetchRange = async (type, start, end) => {
  const field = `${type.replaceAll('-', '_')}.${filterFields[dataTypes[type]]}`;
  const filter = `${field} >= "${start}" AND ${field} < "${end}"`;
  const pageSize =
    dataTypes[type] === 'sleep' || type === 'exercise' ? 25 : 10000;
  const points = [];
  let pageToken;
  do {
    const params = new URLSearchParams({filter, pageSize});
    if (pageToken) params.set('pageToken', pageToken);
    const page = await googleGet(
      'health',
      `${api}/${type}/dataPoints?${params}`,
    );
    points.push(...(page.dataPoints ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return points.reverse(); // the API returns newest first
};

const monthsFrom = (since) => {
  const months = [];
  const d = new Date(`${since}-01T00:00:00Z`);
  const now = new Date();
  while (d <= now) {
    months.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
};

const nextMonth = (month) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
};

// Each type is saved as one JSONL file per month. Months already on disk are
// skipped, except the two most recent, which may have gained data since.
const syncType = async (type, months) => {
  const dir = join(outDir, type);
  await mkdir(dir, {recursive: true});
  const existing = new Set((await readdir(dir)).map((f) => f.slice(0, 7)));
  const recent = months.slice(-2);
  let count = 0;
  for (const month of months) {
    if (existing.has(month) && !recent.includes(month)) continue;
    const points = await fetchRange(
      type,
      `${month}-01`,
      `${nextMonth(month)}-01`,
    );
    await writeFile(
      join(dir, `${month}.jsonl`),
      points.map((p) => JSON.stringify(p) + '\n').join(''),
    );
    count += points.length;
    process.stdout.write(`\r${type} ${month}: ${count} points`);
  }
  console.log(`\r${type}: ${count} new points${' '.repeat(20)}`);
};

const defaultSince = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 7);
};

const main = async () => {
  const months = monthsFrom(arg('since') ?? defaultSince());
  const types = arg('types')?.split(',') ?? Object.keys(dataTypes);
  const unknown = types.filter((t) => !dataTypes[t]);
  if (unknown.length) throw new Error(`Unknown types: ${unknown.join(', ')}`);

  for (const type of types) {
    try {
      await syncType(type, months);
    } catch (e) {
      console.log(`\n${type} failed: ${e.message}`);
    }
  }
};

await main();
