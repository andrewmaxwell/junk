import {benchmark} from './benchmark.js';

const tests = [];

for (let i = 100; i < 1000; i += 50) {
  const vals = [];
  for (let j = 0; j < i; j++) {
    vals[j] = Math.floor(Math.random() * i);
  }
  tests.push([vals]);
}

benchmark(
  {
    // setFilter: (values) => {
    //   const seen = new Set();
    //   return values.filter((v) => {
    //     if (seen.has(v)) return false;
    //     seen.add(v);
    //     return true;
    //   });
    // },
    // setLoop: (values) => {
    //   const seen = new Set();
    //   const result = [];
    //   for (let i = 0; i < values.length; i++) {
    //     if (seen.has(values[i])) continue;
    //     seen.add(values[i]);
    //     result.push(values[i]);
    //   }
    //   return result;
    // },
    objFilter: (values) => {
      const seen = {};
      return values.filter((v) => {
        if (seen[v]) return false;
        seen[v] = true;
        return true;
      });
    },
    objLoop: (values) => {
      const seen = {};
      const result = [];
      for (let i = 0; i < values.length; i++) {
        if (seen[values[i]]) continue;
        seen[values[i]] = true;
        result.push(values[i]);
      }
      return result;
    },
    objLoopVar: (values) => {
      const seen = {};
      const result = [];
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (seen[v]) continue;
        seen[v] = true;
        result.push(v);
      }
      return result;
    },
    arrLoopVar: (values) => {
      const seen = [];
      const result = [];
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (seen[v]) continue;
        seen[v] = true;
        result.push(v);
      }
      return result;
    },
    bad: (values) => values.filter((v, i) => values.indexOf(v) === i),
    set: (values) => [...new Set(values)],
  },
  tests
);
