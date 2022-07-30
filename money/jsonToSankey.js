import fs from 'fs';

const sum = (arr) => Object.values(arr).reduce((a, b) => a + b, 0);

const treeSum = (ob) => {
  if (typeof ob === 'number') return ob;
  if (ob && typeof ob === 'object')
    return Object.values(ob).reduce((a, b) => a + treeSum(b), 0);
  return 0;
};

const getIncome = (ob, label, toPercent) =>
  Object.entries(ob)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([key, val]) =>
        `${key} [${toPercent(
          val && typeof val === 'object' ? sum(val) : val
        )}] ${label}`
    );

const getExpenses = (ob, label, toPercent) =>
  Object.entries(ob)
    .sort((a, b) => treeSum(b[1]) - treeSum(a[1]))
    .flatMap(([key, val]) =>
      val && typeof val === 'object'
        ? [
            `${label} [${toPercent(sum(val))}] ${key}`,
            // ...getExpenses(val, key, toPercent),
          ]
        : `${label} [${toPercent(val)}] ${key}`
    );

const data = JSON.parse(fs.readFileSync('money/incomeExpenses.json', 'utf-8'));

const householdBudget = treeSum(data.Expenses);
console.log('householdBudget', householdBudget.toLocaleString());
const toPercent = (x) => Math.round((x / householdBudget) * 1000) / 10;

const andrewsNet = toPercent(data.gross - treeSum(data.withheld));
const result = [
  `Andrew's Gross Income [${andrewsNet}] Andrew's Net Income`,
  `Andrew's Net Income [${andrewsNet}] Total Budget`,
  ...getExpenses(data.withheld, "Andrew's Gross Income", toPercent),
  ...getIncome(data.Income, 'Total Budget', toPercent),
  ...getExpenses(data.Expenses, 'Total Budget', toPercent),
].join('\n');

fs.writeFileSync('output.txt', result);
