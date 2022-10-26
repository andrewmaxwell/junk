// const memoize =
//   (func, cache = {}) =>
//   (...args) =>
//     (cache[args] = cache[args] || func(...args));

const sum = (num, min = 1) => {
  if (num < 4) return num;

  let total = 0;
  for (let i = min; i - num; i++) {
    total += sum(num - i, i);
  }
  return total;
};

import {Test} from './test.js';
Test.assertEquals(sum(1), 1);
Test.assertEquals(sum(2), 2); // 1,1; 2
Test.assertEquals(sum(3), 3); // 1,1,1; 1,2; 3
Test.assertEquals(sum(4), 5); // 1,1,1,1; 1,1,2; 1,3; 2,2; 4
Test.assertEquals(sum(5), 7); // 1,1,1,1,1; 1,1,1,2; 1,1,3; 1,2,2; 1,4; 2,3; 5;
Test.assertEquals(sum(6), 11); // 1,1,1,1,1,1; 1,1,1,1,2; 1,1,1,3; 1,1,2,2; 1,1,4; 1,2,3; 1,5; 2,2,2; 2,4; 3,3; 6;
Test.assertEquals(sum(10), 42);
