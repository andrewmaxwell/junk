class Sudoku {
  constructor(board) {
    this.board = board;
  }
  isValid() {
    console.log(this.board);
    const {board} = this;
    const size = this.board.length;
    const sqrtSize = Math.sqrt(size);
    const valid = (x) => typeof x === 'number' && x > 0 && x <= size;
    for (let i = 0; i < size; i++) {
      const r = [];
      const c = [];
      const g = [];
      for (let j = 0; j < size; j++) {
        const ri = board[i][j];
        const ci = board[j][i];
        const groupRow =
          Math.floor(i / sqrtSize) * sqrtSize + Math.floor(j / sqrtSize);
        const groupCol = (i % sqrtSize) * sqrtSize + (j % sqrtSize);
        const gi = board[groupRow][groupCol];
        if (r[ri] || c[ci] || g[gi] || !valid(ri) || !valid(ci) || !valid(gi))
          return false;
        r[ri] = c[ci] = g[gi] = true;
      }
    }
    return true;
  }
}

import {Test, it} from './test.js';
Test.failFast = true;

var goodSudoku1 = new Sudoku([
  [7, 8, 4, 1, 5, 9, 3, 2, 6],
  [5, 3, 9, 6, 7, 2, 8, 4, 1],
  [6, 1, 2, 4, 3, 8, 7, 5, 9],

  [9, 2, 8, 7, 1, 5, 4, 6, 3],
  [3, 5, 7, 8, 4, 6, 1, 9, 2],
  [4, 6, 1, 9, 2, 3, 5, 8, 7],

  [8, 7, 6, 3, 9, 4, 2, 1, 5],
  [2, 4, 3, 5, 6, 1, 9, 7, 8],
  [1, 9, 5, 2, 8, 7, 6, 3, 4],
]);

var goodSudoku2 = new Sudoku([
  [1, 4, 2, 3],
  [3, 2, 4, 1],

  [4, 1, 3, 2],
  [2, 3, 1, 4],
]);

var badSudoku1 = new Sudoku([
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],

  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],

  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
]);

var badSudoku2 = new Sudoku([[1, 2, 3, 4, 5], [1, 2, 3, 4], [1, 2, 3, 4], [1]]);

it('should be valid', function () {
  Test.assertEquals(goodSudoku1.isValid(), true);
  Test.assertEquals(goodSudoku2.isValid(), true);
});

it('should be invalid', function () {
  Test.assertEquals(badSudoku1.isValid(), false);
  Test.assertEquals(badSudoku2.isValid(), false);
});
