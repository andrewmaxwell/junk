import {equals} from 'ramda';
import {shuffle} from '../carcassonne/utils.js';

const toMilliseconds = ([s, ns]) => s * 1000 + ns / 1e6;

export const benchmark = (funcs, tests) => {
  const times = {};
  const start = process.hrtime();
  for (const key in funcs) {
    times[key] = 0;
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

  const iterations = Math.round(1e5 / toMilliseconds(process.hrtime(start)));
  const funcArr = Object.entries(funcs);

  console.log(`${iterations.toLocaleString()} iterations`);

  for (let i = 0; i < iterations; i++) {
    for (const [key, func] of shuffle(funcArr)) {
      for (const args of tests) {
        const start = process.hrtime();
        func(...args);
        times[key] += toMilliseconds(process.hrtime(start));
      }
    }
  }

  const sorted = Object.entries(times).sort((a, b) => a[1] - b[1]);

  const result = sorted
    .map(([name, time]) => `${name}: ${(time / sorted[0][1]).toLocaleString()}`)
    .join('\n');

  console.log(result);
};
