/**
 * A generic depth-first searcher
 * @template State
 * @param {(state: State) => State[] | undefined} getNextStates
 */
const DFS =
  (getNextStates) =>
  /** @param {State} initialState */
  (initialState) => {
    const stack = [initialState];
    while (stack.length) {
      const current = stack.pop();
      // @ts-expect-error current will not be undefined
      const nextStates = getNextStates(current);
      if (!nextStates) return current;
      stack.push(...nextStates);
    }
    // no solution
  };

/////////////

// A simple sudoku solver using the backtracker
const cols = [0, 1, 2, 3, 4, 5, 6, 7, 8];

/** @type {(board: number[][]) => number[][] | undefined} */
const solveSudoku = DFS((board) => {
  const row = board.findIndex((r) => r.includes(0));
  if (row === -1) return; // done

  const col = board[row]?.findIndex((c) => c === 0);
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;

  /** @type {number[][][]} */
  const result = [];
  for (let v = 1; v <= 9; v++) {
    const isValid = cols.every(
      (i) =>
        board[row][i] !== v &&
        board[i][col] !== v &&
        board[br + Math.floor(i / 3)][bc + (i % 3)] !== v,
    );
    if (isValid) {
      // make a new version of the board
      const newBoard = [...board];
      newBoard[row] = [...board[row]];
      newBoard[row][col] = v;
      result.push(newBoard);
    }
  }
  return result;
});

import {Test} from './test.js';

Test.assertDeepEquals(
  solveSudoku([
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ]),
  [
    [5, 3, 4, 6, 7, 8, 9, 1, 2],
    [6, 7, 2, 1, 9, 5, 3, 4, 8],
    [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3],
    [4, 2, 6, 8, 5, 3, 7, 9, 1],
    [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4],
    [2, 8, 7, 4, 1, 9, 6, 3, 5],
    [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ],
);
