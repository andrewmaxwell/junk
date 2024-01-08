const findBestCol = (grid, cols) => {
  let best;
  let min = Infinity;
  for (let i = 0; i < cols.length; i++) {
    const numOnes = grid.reduce((count, row) => count + row[cols[i]], 0);
    if (numOnes < min) {
      min = numOnes;
      best = cols[i];
    }
  }
  return best;
};

const solve = (grid, cols = Object.keys(grid[0])) => {
  if (!grid.length && !cols.length) return [];
  const selectedColumn = findBestCol(grid, cols);

  for (const selectedRow of grid) {
    if (!selectedRow[selectedColumn]) continue;
    const subSolution = solve(
      grid.filter((r) => cols.every((c) => !r[c] || !selectedRow[c])),
      cols.filter((c) => !selectedRow[c])
    );
    if (subSolution) return [selectedRow, ...subSolution];
  }
};

const result = solve([
  [1, 0, 0, 1, 0, 0, 1],
  [1, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 1, 0, 1],
  [0, 0, 1, 0, 1, 1, 0],
  [0, 1, 1, 0, 0, 1, 1],
  [0, 1, 0, 0, 0, 0, 1],
]);
console.log(result.map((r) => r.join('')).join('\n'));
