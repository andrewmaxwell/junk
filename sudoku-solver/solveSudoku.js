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

// solveSudoku a board starting at [row][col]
export const solveSudoku = (board, row = 0, col = 0) => {
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
