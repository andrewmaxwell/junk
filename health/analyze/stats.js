// Shared helpers for the analysis scripts.
import {join} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';

const db = await DuckDBInstance.create(
  join(import.meta.dirname, '..', 'data', 'health.duckdb'),
  {access_mode: 'READ_ONLY'},
);
const con = await db.connect();

export const query = async (sql) =>
  (await con.runAndReadAll(sql)).getRowObjectsJson();

// Mantel-Haenszel risk ratio with the Greenland-Robins confidence interval:
// compares rows where `exposure` is true vs false within each stratum (e.g.
// calendar month) and pools the result. Rows where either value is null
// are skipped.
export const mantelHaenszel = (rows, exposure, outcome) => {
  const strata = Map.groupBy(
    rows.filter((r) => r[exposure] !== null && r[outcome] !== null),
    (r) => r.stratum,
  );
  let num = 0;
  let den = 0;
  let varNum = 0;
  let exposedRows = 0;
  let exposedCases = 0;
  let otherRows = 0;
  let otherCases = 0;
  for (const group of strata.values()) {
    const n1 = group.filter((r) => r[exposure]).length;
    const n0 = group.length - n1;
    if (!n1 || !n0) continue; // a stratum without both kinds of row tells us nothing
    const a = group.filter((r) => r[exposure] && r[outcome]).length;
    const c = group.filter((r) => !r[exposure] && r[outcome]).length;
    const n = n1 + n0;
    num += (a * n0) / n;
    den += (c * n1) / n;
    varNum += (n1 * n0 * (a + c) - a * c * n) / n ** 2;
    exposedRows += n1;
    exposedCases += a;
    otherRows += n0;
    otherCases += c;
  }
  const rr = num / den;
  const se = Math.sqrt(varNum / (num * den));
  return {
    exposedRows,
    exposedRate: exposedCases / exposedRows,
    otherRate: otherCases / otherRows,
    rr,
    low: Math.exp(Math.log(rr) - 1.96 * se),
    high: Math.exp(Math.log(rr) + 1.96 * se),
  };
};

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-');

// Prints one Mantel-Haenszel line per [key, label] exposure.
export const printRiskRatios = (rows, exposures, outcome, unit = 'days') => {
  console.log(
    'Exposure'.padEnd(72),
    unit.padStart(6),
    'rate'.padStart(5),
    'vs'.padStart(5),
    '  RR  (95% CI)',
  );
  for (const [key, label] of exposures) {
    const r = mantelHaenszel(rows, key, outcome);
    console.log(
      label.padEnd(72),
      String(r.exposedRows).padStart(6),
      pct(r.exposedRate).padStart(5),
      pct(r.otherRate).padStart(5),
      ` ${fmt(r.rr)} (${fmt(r.low)}-${fmt(r.high)})`,
    );
  }
};
