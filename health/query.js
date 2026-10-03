// Runs SQL against data/health.duckdb and prints the result as a table.
// Usage: node health/query.js "select * from days order by day desc limit 7"

import {join} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';

const db = await DuckDBInstance.create(
  join(import.meta.dirname, 'data', 'health.duckdb'),
  {access_mode: 'READ_ONLY'},
);
const con = await db.connect();
const result = await con.runAndReadAll(process.argv[2]);
console.table(result.getRowObjectsJson());
