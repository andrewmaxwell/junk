import {benchmark} from './benchmark';

const numbers = [];
for (let i = 0; i < 1000; i++) numbers[i] = Math.random();

benchmark(
  {
    forLoop: () => {
      let sum = 0;
      for (let i = 0; i < numbers.length; i++) {
        sum += numbers[i];
      }
      return sum;
    },
    forOf: () => {
      let sum = 0;
      for (const n of numbers) {
        sum += n;
      }
      return sum;
    },
    reduce: () => numbers.reduce((a, b) => a + b, 0),
    forIn: () => {
      let sum = 0;
      for (const n in numbers) {
        sum += numbers[n];
      }
      return sum;
    },
    while: () => {
      let sum = 0;
      let i = 0;
      while (i < numbers.length) {
        sum += numbers[i];
        i++;
      }
      return sum;
    },
  },
  [[]]
);
