function combine(intervals) {
  const result = [];
  for (const curr of intervals.sort((a, b) => a[0] - b[0])) {
    const prev = result.pop();
    if (!prev) result.push(curr);
    else if (curr[0] <= prev[1]) {
      result.push([Math.min(curr[0], prev[0]), Math.max(curr[1], prev[1])]);
    } else {
      result.push(prev, curr);
    }
  }
  return result;
}

const last = (arr) => arr[arr.length - 1];
const combine = (intervals) =>
  intervals
    .sort((a, b) => a[0] - b[0])
    .reduce(
      (result, curr) =>
        curr[0] <= last(result)?.[1]
          ? [
              ...result.slice(0, -1),
              [
                Math.min(curr[0], last(result)[0]),
                Math.max(curr[1], last(result)[1]),
              ],
            ]
          : [...result, curr],
      []
    );

import {Test} from './test.js';

Test.assertDeepEquals(
  combine([
    [1, 3],
    [2, 6],
    [8, 10],
    [15, 18],
  ]),
  [
    [1, 6],
    [8, 10],
    [15, 18],
  ]
);

Test.assertDeepEquals(
  combine([
    [1, 2],
    [3, 4],
    [5, 6],
  ]),
  [
    [1, 2],
    [3, 4],
    [5, 6],
  ]
);

Test.assertDeepEquals(
  combine([
    [1, 5],
    [2, 3],
  ]),
  [[1, 5]]
);

Test.assertDeepEquals(
  combine([
    [1, 4],
    [0, 2],
    [3, 5],
  ]),
  [[0, 5]]
);

Test.assertDeepEquals(
  combine([
    [1, 3],
    [3, 6],
  ]),
  [[1, 6]]
);

Test.assertDeepEquals(combine([[2, 6]]), [[2, 6]]);

Test.assertDeepEquals(combine([]), []);

Test.assertDeepEquals(
  combine([
    [5, 6],
    [2, 4],
    [0, 1],
  ]),
  [
    [0, 1],
    [2, 4],
    [5, 6],
  ]
);
