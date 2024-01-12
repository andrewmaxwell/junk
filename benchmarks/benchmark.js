import {equals} from 'ramda';
import {shuffle} from '../carcassonne/utils.js';

const toMilliseconds = ([s, ns]) => s * 1000 + ns / 1e6;

const getExecutionTime = (func) => {
  const start = process.hrtime();
  func();
  return toMilliseconds(process.hrtime(start));
};

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

const checkTests = (funcs, tests) => {
  const firstFunc = Object.values(funcs)[0];
  for (const args of tests) {
    const expected = firstFunc(...args);
    for (const key in funcs) {
      const actual = funcs[key](...args);
      if (equals(actual, expected)) continue;
      throw new Error(
        `Expected ${key}(${args.join(', ')}) to be ${JSON.stringify(
          expected
        )}, got ${JSON.stringify(actual)}`
      );
    }
  }
};

const runIterations = (funcs, tests, iterations, showOutput) => {
  const funcArr = Object.entries(funcs);
  const times = {};
  for (const [key] of funcArr) times[key] = [];

  for (let i = 0; i < iterations; i++) {
    if (showOutput && i && i % 1000 === 0) {
      console.log(Math.round((100 * i) / iterations) + '%');
      // output(times);
    }
    for (const [key, func] of shuffle(funcArr)) {
      for (const args of tests) {
        times[key].push(getExecutionTime(() => func(...args)));
      }
    }
  }

  if (showOutput) output(times);
};

export const benchmark = (funcs, tests) => {
  checkTests(funcs, tests);

  const iterations = Math.round(
    3e5 / getExecutionTime(() => runIterations(funcs, tests, 10, false))
  );

  console.log(`${iterations.toLocaleString()} iterations`);

  runIterations(funcs, tests, iterations, true);
};
