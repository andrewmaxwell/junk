import fs from 'fs';
import {makeHistogram} from './makeHistogram.js';

const run = (total) => {
  let numVisited = 0;
  let day = 0;
  let lightOn = false;
  const visited = [];

  while (numVisited < total - 1) {
    day++;
    const num = Math.floor(Math.random() * total);

    if (num === 0 && lightOn) {
      lightOn = false;
      numVisited++;
    } else if (num > 0 && !lightOn && !visited[num]) {
      visited[num] = true;
      if (num > 0) lightOn = true;
    }
  }
  return day;
};

console.log(run(10));

// fs.writeFileSync(
//   'prisoners.json',
//   JSON.stringify(Array.from({length: 1e5}, run))
// );

// const mean = (vals) => vals.reduce((a, b) => a + b, 0) / vals.length;
// const stDev = (vals) => {
//   const m = mean(vals);
//   return Math.sqrt(mean(vals.map((v) => (v - m) ** 2)));
// };

// const data = JSON.parse(fs.readFileSync('prisoners.json'));

// console.log(makeHistogram(data));
// console.log('mean', mean(data));
