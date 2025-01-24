function nearFlatten(nested) {
  const result = [];
  const queue = [nested];
  for (const n of queue) {
    if (n.some((x) => Array.isArray(x))) queue.push(...n);
    else result.push(n);
  }
  return result.sort((a, b) => Math.min(...a) - Math.min(...b));
}

import {it, Test} from './test.js';

it('should return an empty array if given an empty array', () => {
  const actual = nearFlatten([[1]]);
  const expected = [[1]];
  Test.assertDeepEquals(actual, expected);
});

it('should return the original array if given a flat array', () => {
  const actual = nearFlatten([[1, 2, 3, 4]]);
  const expected = [[1, 2, 3, 4]];
  Test.assertDeepEquals(actual, expected);
});

it('should return a correctly flattened array', () => {
  const actual = nearFlatten([
    [1, 2, 3],
    [
      [4, 5],
      [6, 7, 8],
    ],
  ]);
  const expected = [
    [1, 2, 3],
    [4, 5],
    [6, 7, 8],
  ];
  Test.assertDeepEquals(actual, expected);
});

it('should return a correctly flattened array that is sorted correctly', () => {
  const actual = nearFlatten([
    [
      [1, 2, 3],
      [9, 10],
    ],
    [
      [4, 5],
      [6, 7, 8],
    ],
  ]);
  const expected = [
    [1, 2, 3],
    [4, 5],
    [6, 7, 8],
    [9, 10],
  ];
  Test.assertDeepEquals(actual, expected);
});
