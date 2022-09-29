import {benchmark} from './benchmark';

benchmark(
  {
    arrayKeys: (num) => [...Array(num).keys()],
    forLoop: (num) => {
      const result = [];
      for (let i = 0; i < num; i++) result[i] = i;
      return result;
    },
    forLoop2: (num) => {
      const result = new Array(num);
      for (let i = 0; i < num; i++) result[i] = i;
      return result;
    },
    fill: (num) => new Array(num).fill().map((v, i) => i),
  },
  [...Array(100).keys()].map((v) => [v])
);
