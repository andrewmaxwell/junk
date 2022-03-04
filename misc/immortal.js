const elderAge = (m, n, l, t) => {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      sum += Math.max(0, (i ^ j) - l);
    }
  }
  return sum % t;
};

// const grid = [];
// for (let i = 0; i < 80; i++) {
//   grid[i] = [];
//   for (let j = 0; j < 80; j++) {
//     grid[i][j] = i ^ j;
//   }
// }
// console.log(
//   grid.map((r) => r.map((x) => String(x).padStart(3)).join('')).join('\n')
// );

const grid = [];
const rows = 32;
const cols = 32;
for (let i = 0; i < rows; i++) {
  grid[i] = [];
  for (let j = 0; j < cols; j++) {
    grid[i][j] = elderAge(j, i, 0, Infinity);
  }
}
for (let i = rows - 1; i > 0; i--) {
  for (let j = 0; j < cols; j++) {
    grid[i][j] -= grid[i - 1][j];
  }
}
console.log(
  grid.map((r) => r.map((x) => String(x).padStart(5)).join('')).join('\n')
);

import {Test} from './test.js';

Test.assertEquals(elderAge(8, 5, 1, 100), 5);
Test.assertEquals(elderAge(8, 8, 0, 100007), 224);
Test.assertEquals(elderAge(25, 31, 0, 100007), 11925);
Test.assertEquals(elderAge(5, 45, 3, 1000007), 4323);
Test.assertEquals(elderAge(31, 39, 7, 2345), 1586);
Test.assertEquals(elderAge(545, 435, 342, 1000007), 808451);
// You need to run this test very quickly before attempting the actual tests :)
// Test.assertEquals(
//   elderAge(28827050410, 35165045587, 7109602, 13719506),
//   5456283
// );
