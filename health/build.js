// Rebuilds data/health.duckdb from everything in data/. Run after fetching.
// Usage: node health/build.js
// Then query with: node health/query.js "select * from days order by day desc limit 7"
// Also writes data/viz.json for index.html.

import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';
import {ingestCpap} from './ingest/cpap.js';

const dataDir = join(import.meta.dirname, 'data');
const tablesDir = join(dataDir, 'tables');
const dbPath = join(dataDir, 'health.duckdb');

// EDF files need parsing in JS; everything else DuckDB reads directly.
console.log('Parsing CPAP files...');
await mkdir(tablesDir, {recursive: true});
for (const [name, rows] of Object.entries(
  await ingestCpap(join(dataDir, 'cpap')),
)) {
  await writeFile(
    join(tablesDir, `${name}.jsonl`),
    rows.map((r) => JSON.stringify(r) + '\n').join(''),
  );
}

await rm(dbPath, {force: true});
const db = await DuckDBInstance.create(dbPath);
const con = await db.connect();
await con.run(`SET file_search_path = '${dataDir}'`);

// Statements are separated by lines containing only "--".
const sql = await readFile(join(import.meta.dirname, 'schema.sql'), 'utf8');
for (const statement of sql.split(/^--$/m)) {
  if (!statement.replace(/--.*$/gm, '').trim()) continue;
  const name = statement.match(
    /CREATE (?:OR REPLACE )?(?:TABLE|VIEW|MACRO) (\w+)/i,
  )?.[1];
  try {
    await con.run(statement);
  } catch (e) {
    throw new Error(
      `schema.sql failed at ${name ?? statement.slice(0, 80)}: ${e.message}`,
    );
  }
}

const tables = await con.runAndReadAll(
  `SELECT table_name, estimated_size FROM duckdb_tables() ORDER BY table_name`,
);
for (const {table_name, estimated_size} of tables.getRowObjects()) {
  console.log(`${table_name}: ${estimated_size} rows`);
}

// Everything index.html draws, as plain JSON. BIGINTs are cast so they come
// out as numbers, and per-second data is averaged down to keep the file small.
const viz = {
  days: `SELECT day, weekday, energy, mood, anxiety, headache, exercise, notes, tags,
      headache_events::INT AS headache_events, headache_first_time, triptan,
      cpap_usage_min::INT AS cpap_usage_min, bedtime, final_wake, insomnia,
      awake_mid_night_min::INT AS awake_mid_night_min, ahi, leak_95,
      minutes_asleep, deep_min::INT AS deep_min, rem_min::INT AS rem_min,
      fitbit_sleep_onset_min::INT AS fitbit_sleep_onset_min,
      fitbit_awake_in_bed_min::INT AS fitbit_awake_in_bed_min,
      fitbit_long_wake, fitbit_long_wake_min::INT AS fitbit_long_wake_min,
      fitbit_long_wake_from, fitbit_insomnia, resting_hr, hrv_ms, bedroom_co2_avg, bedroom_temp_c,
      outdoor_temp_max, outdoor_temp_min, pressure_change_24h, aqi_max,
      steps::INT AS steps, slept_km_from_home, tz_shift_h, hours_out,
      places_visited::INT AS places_visited, drive_min::INT AS drive_min
    FROM days WHERE day < current_date + 1 ORDER BY day`,
  timeline: `SELECT day, kind, event FROM timeline ORDER BY day`,
  headaches: `SELECT start, title FROM headaches ORDER BY start`,
  sessions: `SELECT start, "end" FROM cpap_sessions ORDER BY start`,
  cpapEvents: `SELECT ts, type FROM cpap_events ORDER BY ts`,
  cpapMinutes: `SELECT time_bucket(INTERVAL 2 MINUTE, ts) AS ts,
      round(avg(leak), 2) AS leak, round(avg(resp_rate), 1) AS resp_rate,
      round(avg(flow_lim), 2) AS flow_lim
    FROM cpap_minutes GROUP BY ALL ORDER BY ts`,
  heartRate: `SELECT time_bucket(INTERVAL 1 MINUTE, ts) AS ts, round(avg(bpm))::INT AS bpm
    FROM heart_rate GROUP BY ALL ORDER BY ts`,
  sleepStages: `SELECT start, "end", stage FROM sleep_stages ORDER BY start`,
  air: `SELECT time_bucket(INTERVAL 5 MINUTE, ts) AS ts, round(avg(co2_ppm))::INT AS co2,
      round(avg(temp_c), 1) AS temp_c
    FROM air GROUP BY ALL ORDER BY ts`,
  weather: `SELECT ts, temperature_2m AS temp_c, pressure_msl
    FROM weather WHERE ts >= (SELECT min(start) FROM cpap_sessions) ORDER BY ts`,
};
for (const [key, sql] of Object.entries(viz)) {
  viz[key] = (await con.runAndReadAll(sql)).getRowObjectsJson();
}
await writeFile(join(dataDir, 'viz.json'), JSON.stringify(viz));
console.log('viz.json written');
