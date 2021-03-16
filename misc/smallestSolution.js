const getCombos = (arr, len, acc = []) =>
  len
    ? arr.flatMap((x, i) => getCombos(arr.slice(i + 1), len - 1, [...acc, x]))
    : [acc];

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

const solve = (input) => {
  const nums = [...new Set(input.flat())].sort((a, b) => a - b);
  for (let len = 1; len < nums.length; len++) {
    for (const c of getCombos(nums, len).sort((a, b) => sum(a) - sum(b))) {
      if (input.every((row) => c.some((x) => row.includes(x)))) return c;
    }
  }
  return nums;
};

const {Test} = require('./test');
Test.assertEquals(solve([[1], [1]]), [1]);
Test.assertEquals(
  solve([
    [1, 2],
    [1, 2],
  ]),
  [1]
);
Test.assertEquals(
  solve([
    [1, 2],
    [2, 3],
  ]),
  [2]
);
Test.assertEquals(
  solve([
    [1, 2, 3],
    [1, 3],
  ]),
  [1]
);
Test.assertEquals(solve([[1], [2]]), [1, 2]);
Test.assertEquals(
  solve([
    [2, 4],
    [6, 8],
  ]),
  [2, 6]
);
Test.assertEquals(
  solve([
    [1, 2, 3],
    [2, 3, 4, 5],
    [4, 5, 6],
  ]),
  [1, 4]
);
Test.assertEquals(
  solve([
    [1, 2, 3],
    [4, 5],
    [1, 6, 7, 8],
    [2, 4, 6],
    [4, 7, 9],
  ]),
  [1, 4]
);
Test.assertEquals(
  solve([
    [4, 5],
    [1, 2, 3],
    [4, 5],
    [6, 7, 8],
    [2, 6],
    [7, 9],
  ]),
  [2, 4, 7]
);
Test.assertEquals(
  solve([
    [5, 6, 8],
    [1, 1, 4, 3, 7, 5, 4],
    [5, 0, 2, 2, 4, 3, 6, 2],
    [5, 1, 5, 1, 8, 8],
    [7, 2, 3, 6],
    [9],
  ]),
  [1, 6, 9]
);
