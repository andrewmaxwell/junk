/* eslint-disable no-use-before-define */

const unlessEmpty = (func) => (matrix) =>
  matrix.length && matrix[0].length ? func(matrix) : [];

const up = unlessEmpty((matrix) => [
  ...matrix.map((r) => r[0]).reverse(),
  ...matrixSort(matrix.map((r) => r.slice(1))),
]);

const left = unlessEmpty((matrix) => [
  ...matrix[matrix.length - 1].slice().reverse(),
  ...up(matrix.slice(0, -1)),
]);

const down = unlessEmpty((matrix) => [
  ...matrix.map((r) => r[r.length - 1]),
  ...left(matrix.map((r) => r.slice(0, -1))),
]);

const matrixSort = unlessEmpty((matrix) => [
  ...matrix[0],
  ...down(matrix.slice(1)),
]);

const {Test} = require('./test');

Test.assertDeepEquals(
  matrixSort([
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ]),
  [1, 2, 3, 6, 9, 8, 7, 4, 5]
);

Test.assertDeepEquals(matrixSort([]), []);
Test.assertDeepEquals(matrixSort([[]]), []);
