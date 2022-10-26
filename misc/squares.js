// https://www.codewars.com/kata/54eb33e5bc1a25440d000891/train/javascript

// const memoize =
//   (func, memo = {}) =>
//   (n) =>
//     (memo[n] = memo[n] || func(n));

const findSolution = (amt, arr) => {
  for (let i = arr[0] - 1; i > 0; i--) {
    const next = amt - i * i;
    if (next === 0) return [i, ...arr];
    if (next > 0) {
      const s = findSolution(next, [i, ...arr]);
      if (s) return s;
    }
  }
};

const decompose = (n) => {
  if (n === 1) return [1];
  for (let i = n - 1; i > 0; i--) {
    const s = findSolution(n * n - i * i, [i]);
    if (s) return s;
  }
  return null;
};

import {Test} from './test.js';
Test.assertDeepEquals(decompose(1), [1]);
Test.assertDeepEquals(decompose(2), null);
Test.assertDeepEquals(decompose(5), [3, 4]);
Test.assertDeepEquals(decompose(7), [2, 3, 6]);
Test.assertDeepEquals(decompose(11), [1, 2, 4, 10]);
Test.assertDeepEquals(decompose(12), [1, 2, 3, 7, 9]);
Test.assertDeepEquals(decompose(44), [2, 3, 5, 7, 43]);
Test.assertDeepEquals(decompose(50), [1, 3, 5, 8, 49]);
Test.assertDeepEquals(decompose(625), [2, 5, 8, 34, 624]);
