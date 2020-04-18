const getMax = (a, b) =>
  Math.max(Math.abs(a[0] - b[b.length - 1]), Math.abs(b[0] - a[a.length - 1]));

const getMin = (a, b) => {
  let minDiff = Infinity;
  for (
    let i = 0, j = 0;
    minDiff && i < a.length && j < b.length;
    a[i] < b[j] ? i++ : j++
  ) {
    minDiff = Math.min(minDiff, Math.abs(a[i] - b[j]));
  }
  return minDiff;
};

const sorter = (a, b) => a - b;
const maxAndMin = (a, b) => {
  a.sort(sorter);
  b.sort(sorter);
  return [getMax(a, b), getMin(a, b)];
};

const {Test} = require('./test.js');
Test.assertDeepEquals(maxAndMin([3, 10, 5], [20, 7, 15, 8]), [17, 2]);
Test.assertDeepEquals(maxAndMin([3], [20]), [17, 17]);
Test.assertDeepEquals(maxAndMin([3, 10, 5], [3, 10, 5]), [7, 0]);
Test.assertDeepEquals(maxAndMin([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]), [9, 1]);
var ar1 = [-870, 91, -141, -739, 707, -803, -195, -963, 99, 861],
  ar2 = [
    796,
    -468,
    889,
    58,
    -765,
    -901,
    -311,
    -399,
    -764,
    -181,
    841,
    -670,
    -589,
  ];
Test.assertDeepEquals(maxAndMin(ar1, ar2), [1852, 14]);
