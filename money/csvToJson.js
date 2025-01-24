// node money/csvToJson

import Papa from 'papaparse';
import * as R from 'ramda';
import fs from 'fs';

const csv = Papa.parse(
  fs.readFileSync('/Users/andrew/Downloads/transactions2022.csv', 'utf-8'),
  {header: true}
);

const getAmount = R.pipe(
  (rows) =>
    rows.map((r) => r.Amount * (r['Transaction Type'] === 'debit' ? -1 : 1)),
  R.sum,
  Math.round
);

const result = R.pipe(
  R.filter(
    R.both(R.prop('Description'), R.propSatisfies(R.endsWith('/2022'), 'Date'))
  ),
  R.groupBy((row) => row.Description.replace(/\d/g, '').trim().toLowerCase()),
  R.map(getAmount),
  R.toPairs,
  R.sortBy((p) => p[0]),
  R.fromPairs
)(csv.data);

console.log(result);

// const getAmount = R.pipe(R.pluck('amount'), R.sum, Math.round);

// const result = R.pipe(
//   R.sortBy((row) => Date.parse(row.date)),
//   R.map((row) => ({
//     ...row,
//     amount: row.type === 'debit' ? -row.amount : Number(row.amount),
//   })),
//   R.groupBy((el) =>
//     el.description
//       .replace(/^[A-Z\d]{1,3} ?[*-]/, '') // prefixes
//       .replace(/(?<!^)[0-9'./]|XX\d+/g, '') // numbers and stuff
//       .replace(/([*#~]| {2}|-+ | -).*$/, '') // suffixes
//       .trim()
//   ),
//   R.omit([
//     'CHASE CARD SERV ONLINE PMT',
//     'BANK OF AMERICA ONLINE PMT',
//     'BA ELECTRONIC PAYMENT',
//     'Payment Thank You Bill Pa',
//     'Funds Transfer from Brokerage',
//     'Funds Transfer to Brokerage',
//   ]),
//   R.toPairs,
//   R.map(([name, arr]) => [name, getAmount(arr)]),
//   R.sort(R.descend((p) => p[1])),
//   R.fromPairs
//   // R.values,
//   // R.sum
// )(csv.data);

fs.writeFileSync('money/temp.json', JSON.stringify(result, null, 2));
