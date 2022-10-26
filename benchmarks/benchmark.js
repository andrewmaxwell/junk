import {equals} from 'ramda';
import {shuffle} from '../carcassonne/utils.js';

const toMilliseconds = ([s, ns]) => s * 1000 + ns / 1e6;

const median = (arr) => {
  arr.sort((a, b) => a - b);
  return arr.length % 2
    ? arr[Math.floor(arr.length / 2)]
    : (arr[arr.length / 2] + arr[arr.length / 2 - 1]) / 2;
};

const output = (times) => {
  const sorted = Object.entries(times)
    .map(([name, vals]) => ({name, time: median(vals)}))
    .sort((a, b) => a.time - b.time);

  const result = sorted
    .map(({name, time}, i) =>
      i
        ? `${name}: ${(time / sorted[0].time).toLocaleString()} x slower than ${
            sorted[0].name
          }`
        : `${name} is the fastest`
    )
    .join('\n');

  console.log(result + '\n');
};

export const benchmark = (funcs, tests) => {
  const times = {};

  for (const key in funcs) {
    times[key] = [];
    for (const args of tests) {
      const actual = funcs[key](...args);
      const expected = funcs[Object.keys(funcs)[0]](...args);
      if (!equals(actual, expected)) {
        throw new Error(
          `Expected ${key}(${args.join(', ')}) to be ${JSON.stringify(
            expected
          )}, got ${JSON.stringify(actual)}`
        );
      }
    }
  }

  const funcArr = Object.entries(funcs);

  const start = process.hrtime();
  for (let i = 0; i < 10; i++) {
    for (const [, func] of shuffle(funcArr)) {
      for (const args of tests) func(...args);
    }
  }
  const iterations = Math.round(3e5 / toMilliseconds(process.hrtime(start)));

  console.log(`${iterations.toLocaleString()} iterations`);

  for (let i = 0; i < iterations; i++) {
    if (i && i % 1000 === 0) {
      console.log(Math.round((100 * i) / iterations) + '%');
      output(times);
    }
    for (const [key, func] of shuffle(funcArr)) {
      for (const args of tests) {
        const start = process.hrtime();
        func(...args);
        times[key].push(toMilliseconds(process.hrtime(start)));
      }
    }
  }
};
