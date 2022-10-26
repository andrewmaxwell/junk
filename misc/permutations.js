export const permutations = (arr, m = []) =>
  arr.length
    ? arr.flatMap((el, i) =>
        permutations([...arr.slice(0, i), ...arr.slice(i + 1)], [...m, el])
      )
    : [m];

import {Test} from './test.js';
Test.assertDeepEquals(permutations(['c', 'a', 't']), [
  ['c', 'a', 't'],
  ['c', 't', 'a'],
  ['a', 'c', 't'],
  ['a', 't', 'c'],
  ['t', 'c', 'a'],
  ['t', 'a', 'c'],
]);
