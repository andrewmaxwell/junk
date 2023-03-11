// see if val would work at grid[row][col]
const isValid = (grid, row, col, val) => {
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] == val) return false; // check if val is in row
    if (grid[i][col] == val) return false; // check if val is in column
    if (grid[br + Math.floor(i / 3)][bc + (i % 3)] == val) return false; // check if val is in block
  }
  return true;
};

// solve a board starting at [row][col]
const solveSudoku = (board, row = 0, col = 0) => {
  if (row === board.length) return board; // done

  // skip spots that are already filled in
  if (board[row][col] !== '.') {
    return solveSudoku(board, row + (col === 8), (col + 1) % 9);
  }

  // try 1-9 in the empty spot
  for (let i = 1; i <= 9; i++) {
    if (!isValid(board, row, col, i)) continue; // if the number doesn't work there, try the next number
    board[row][col] = i.toString();
    const solution = solveSudoku(board, row + (col === 8), (col + 1) % 9); // try to fill in the rest
    if (solution) return solution;
  }
  board[row][col] = '.'; // if no solution, blank out the spot and let the caller try the next number
};

import {Test} from './test.js';

Test.assertDeepEquals(
  solveSudoku([
    ['5', '3', '.', '.', '7', '.', '.', '.', '.'],
    ['6', '.', '.', '1', '9', '5', '.', '.', '.'],
    ['.', '9', '8', '.', '.', '.', '.', '6', '.'],
    ['8', '.', '.', '.', '6', '.', '.', '.', '3'],
    ['4', '.', '.', '8', '.', '3', '.', '.', '1'],
    ['7', '.', '.', '.', '2', '.', '.', '.', '6'],
    ['.', '6', '.', '.', '.', '.', '2', '8', '.'],
    ['.', '.', '.', '4', '1', '9', '.', '.', '5'],
    ['.', '.', '.', '.', '8', '.', '.', '7', '9'],
  ]),
  [
    ['5', '3', '4', '6', '7', '8', '9', '1', '2'],
    ['6', '7', '2', '1', '9', '5', '3', '4', '8'],
    ['1', '9', '8', '3', '4', '2', '5', '6', '7'],
    ['8', '5', '9', '7', '6', '1', '4', '2', '3'],
    ['4', '2', '6', '8', '5', '3', '7', '9', '1'],
    ['7', '1', '3', '9', '2', '4', '8', '5', '6'],
    ['9', '6', '1', '5', '3', '7', '2', '8', '4'],
    ['2', '8', '7', '4', '1', '9', '6', '3', '5'],
    ['3', '4', '5', '2', '8', '6', '1', '7', '9'],
  ]
);
