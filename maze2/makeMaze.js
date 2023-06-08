const dirs = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

export const makeMaze = (rows, cols) => {
  const grid = [];

  for (let y = 0; y < rows; y++) {
    grid[y] = new Array(cols).fill(false);
  }

  const queue = [{x: 1, y: 0}];

  while (queue.length) {
    const {x, y} = queue.splice(
      Math.max(0, queue.length - 1 - Math.floor(Math.random() * 4)),
      1
    )[0];

    if (grid[y][x]) continue;

    let openCount = 0;
    for (const [dx, dy] of dirs) {
      const c = grid[y + dy]?.[x + dx];
      if (c === undefined || c) openCount++;
    }

    if (openCount !== 1) continue;

    grid[y][x] = true;

    for (const [dx, dy] of dirs) {
      const c = grid[y + dy]?.[x + dx];
      if (c !== undefined) queue.push({x: x + dx, y: y + dy});
    }
  }

  // add an exit on the last row under the last open spot on the line above
  grid[rows - 1][grid[rows - 2].lastIndexOf(true)] = true;

  return grid;
};
