// Rebuilds data/health.duckdb from everything in data/. Run after fetching.
// Usage: node health/build.js
// Then query with: node health/query.js "select * from days order by day desc limit 7"

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
