const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const findChain = (arr) => {
  const seen = {};
  let result = [];
  for (let r = 0; r < arr.length; r++) {
    for (let c = 0; c < arr[r].length; c++) {
      if (seen[[r, c]]) continue;
      const q = [[r, c]];
      for (let k = 0; k < q.length; k++) {
        const curr = q[k];
        seen[curr] = true;
        for (const [dr, dc] of dirs) {
          const nr = curr[0] + dr;
          const nc = curr[1] + dc;
          if (
            arr[nr] &&
            arr[nr][nc] === arr[curr[0]][curr[1]] &&
            !seen[[nr, nc]]
          ) {
            q.push([nr, nc]);
            seen[[nr, nc]] = true;
          }
        }
      }
      if (q.length > result.length) result = q;
    }
  }
  return result.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

const {Test} = require('./test');
var arr1 = [
  ['b', 'a', 'c', 'b', 'd', 'c', 'b', 'd', 'c', 'd'],
  ['c', 'c', 'a', 'd', 'd', 'd', 'b', 'b', 'c', 'c'],
  ['c', 'a', 'd', 'd', 'b', 'b', 'b', 'a', 'b', 'b'],
  ['c', 'd', 'c', 'b', 'a', 'b', 'a', 'a', 'c', 'c'],
  ['b', 'a', 'b', 'c', 'c', 'd', 'b', 'd', 'd', 'a'],
  ['a', 'a', 'c', 'd', 'd', 'b', 'a', 'b', 'd', 'b'],
  ['a', 'a', 'c', 'c', 'c', 'c', 'd', 'd', 'b', 'c'],
  ['d', 'a', 'd', 'b', 'a', 'd', 'c', 'a', 'c', 'b'],
  ['b', 'a', 'b', 'c', 'a', 'a', 'b', 'a', 'c', 'a'],
  ['d', 'a', 'b', 'c', 'c', 'c', 'b', 'c', 'a', 'd'],
];
var result1 = [
  [4, 1],
  [5, 0],
  [5, 1],
  [6, 0],
  [6, 1],
  [7, 1],
  [8, 1],
  [9, 1],
];
Test.assertSimilar(findChain(arr1), result1, '');

var arr2 = [
  ['a', 'c', 'a', 'a', 'a', 'c', 'b', 'b', 'a', 'b'],
  ['b', 'c', 'c', 'b', 'a', 'd', 'c', 'c', 'a', 'a'],
  ['b', 'a', 'd', 'b', 'a', 'd', 'd', 'd', 'b', 'b'],
  ['d', 'c', 'c', 'c', 'c', 'c', 'd', 'a', 'd', 'c'],
  ['a', 'c', 'c', 'c', 'b', 'c', 'c', 'a', 'a', 'c'],
  ['b', 'a', 'd', 'b', 'b', 'a', 'd', 'a', 'a', 'd'],
  ['c', 'a', 'b', 'a', 'a', 'c', 'c', 'd', 'b', 'a'],
  ['b', 'a', 'a', 'c', 'c', 'd', 'd', 'd', 'd', 'b'],
  ['a', 'd', 'a', 'c', 'b', 'd', 'd', 'd', 'd', 'a'],
  ['d', 'd', 'c', 'b', 'd', 'b', 'd', 'b', 'b', 'b'],
];
var result2 = [
  [3, 1],
  [3, 2],
  [3, 3],
  [3, 4],
  [3, 5],
  [4, 1],
  [4, 2],
  [4, 3],
  [4, 5],
  [4, 6],
];
Test.assertSimilar(findChain(arr2), result2, '');

var arr3 = [
  ['a', 'a', 'a', 'd', 'd', 'c', 'b', 'c', 'a', 'b'],
  ['d', 'a', 'a', 'a', 'a', 'b', 'b', 'd', 'd', 'b'],
  ['c', 'b', 'd', 'c', 'a', 'd', 'c', 'a', 'c', 'c'],
  ['b', 'c', 'b', 'c', 'a', 'a', 'a', 'a', 'd', 'c'],
  ['c', 'd', 'd', 'c', 'd', 'c', 'b', 'a', 'a', 'a'],
  ['b', 'a', 'a', 'a', 'b', 'c', 'a', 'a', 'a', 'a'],
  ['a', 'a', 'c', 'a', 'd', 'c', 'b', 'a', 'a', 'd'],
  ['c', 'a', 'b', 'a', 'd', 'c', 'b', 'a', 'd', 'b'],
  ['d', 'a', 'b', 'a', 'a', 'a', 'a', 'a', 'd', 'b'],
  ['d', 'c', 'c', 'd', 'c', 'd', 'a', 'c', 'd', 'b'],
];
var result3 = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 4],
  [2, 7],
  [3, 4],
  [3, 5],
  [3, 6],
  [3, 7],
  [4, 7],
  [4, 8],
  [4, 9],
  [5, 1],
  [5, 2],
  [5, 3],
  [5, 6],
  [5, 7],
  [5, 8],
  [5, 9],
  [6, 0],
  [6, 1],
  [6, 3],
  [6, 7],
  [6, 8],
  [7, 1],
  [7, 3],
  [7, 7],
  [8, 1],
  [8, 3],
  [8, 4],
  [8, 5],
  [8, 6],
  [8, 7],
  [9, 6],
];
Test.assertSimilar(findChain(arr3), result3, '');
