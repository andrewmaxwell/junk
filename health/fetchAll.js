// Gets the latest data from every source, rebuilds health.duckdb, and reports
// how fresh each source is, so stale manual exports stand out.
// Usage: node health/fetchAll.js

import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';

// In order: weather reads Timeline.json, which fetchDrive.js updates. A failed
// fetch doesn't stop the rest, since the build still uses what's on disk.
const scripts = [
  'fetchGoogleHealth.js',
  'fetchCalendar.js',
  'fetchJournal.js',
  'fetchDrive.js',
  'copyCpapCard.js',
  'fetchWeather.js',
];
const failed = [];
for (const script of scripts) {
  console.log(`\n== ${script}`);
  const {status} = spawnSync('node', [join(import.meta.dirname, script)], {
    stdio: 'inherit',
  });
  if (status !== 0) failed.push(script);
}

console.log('\n== build.js');
const {status} = spawnSync('node', [join(import.meta.dirname, 'build.js')], {
  stdio: 'inherit',
});
if (status !== 0) process.exit(1);

// The newest reading from each source, how many days old it can get before
// it's flagged, and what to do about it. Location only matters much on trips.
const sources = [
  ['Journal', 'SELECT max(ts) FROM journal', 2, 'fill in the form'],
  ['Calendar', 'SELECT max(start) FROM calendar_events WHERE start <= now()'],
  ['Fitbit sleep', 'SELECT max("end") FROM sleep', 2, 'sync the Fitbit app'],
  [
    'Fitbit heart rate',
    'SELECT max(ts) FROM heart_rate',
    2,
    'sync the Fitbit app',
  ],
  ['Steps', 'SELECT max(ts) FROM steps', 2, 'sync the Fitbit app'],
  ['CPAP', 'SELECT max("end") FROM cpap_sessions', 2, 'plug in the SD card'],
  [
    'Aranet4',
    'SELECT max(ts) FROM air',
    2,
    'export from the Aranet app to Google Drive',
  ],
  [
    'Location',
    'SELECT max(ts) FROM location_points',
    30,
    'export Timeline to Google Drive (after trips)',
  ],
  ['Weather', 'SELECT max(ts) FROM weather WHERE ts <= now()'],
];
const db = await DuckDBInstance.create(
  join(import.meta.dirname, 'data', 'health.duckdb'),
  {access_mode: 'READ_ONLY'},
);
const con = await db.connect();
console.log('\n== Latest data');
for (const [name, sql, maxDays = Infinity, fix] of sources) {
  const [[latest]] = (await con.runAndReadAll(sql)).getRowsJson();
  const days = latest ? (Date.now() - Date.parse(latest)) / 864e5 : Infinity;
  const stale = days > maxDays ? `  <- ${fix}` : '';
  console.log(
    `${name.padEnd(18)} ${latest?.slice(0, 16) ?? 'none'.padEnd(16)}  ${Number.isFinite(days) ? `${Math.floor(days)}d ago`.padStart(7) : ''}${stale}`,
  );
}
if (failed.length) console.log(`\nFailed: ${failed.join(', ')}`);
