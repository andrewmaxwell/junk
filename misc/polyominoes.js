// https://oeis.org/A172477 or distinct https://oeis.org/A328020

const padGrid = (grid) => {
  if (grid[0].some((x) => x))
    grid = [new Array(grid[0].length).fill(0), ...grid];
  if (grid[grid.length - 1].some((x) => x))
    grid = [...grid, new Array(grid[0].length).fill(0)];
  if (grid.some((r) => r[0])) grid = grid.map((r) => [0, ...r]);
  if (grid.some((r) => r[r.length - 1])) grid = grid.map((r) => [...r, 0]);
  return grid;
};

const unpadGrid = (grid) => {
  if (!grid[0].some((x) => x)) grid = grid.slice(1);
  if (!grid[grid.length - 1].some((x) => x)) grid = grid.slice(0, -1);
  if (!grid.some((r) => r[0])) grid = grid.map((r) => r.slice(1));
  if (!grid.some((r) => r[r.length - 1]))
    grid = grid.map((r) => r.slice(0, -1));
  return grid;
};

const getChildPolyominoes = (grid) => {
  grid = padGrid(grid);
  const result = [];

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      if (
        !grid[r][c] &&
        (grid[r][c - 1] ||
          grid[r][c + 1] ||
          (grid[r - 1] && grid[r - 1][c]) ||
          (grid[r + 1] && grid[r + 1][c]))
      ) {
        const n = grid.map((r) => [...r]);
        n[r][c] = 1;
        result.push(unpadGrid(n));
      }
    }
  }
  return result;
};

const stringify = (grid) =>
  grid.map((r) => r.map((c) => (c ? '#' : ' ')).join('')).join('\n');

const numParts = (grid) => {
  let total = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[0].length; j++) {
      total += grid[i][j];
    }
  }
  return total;
};

const rotate = (grid) => grid[0].map((_, i) => grid.map((r) => r[i])).reverse();
const flip = (grid) => [...grid].reverse();
const transforms = [rotate, rotate, rotate, flip, rotate, rotate, rotate];

const getPolyominoes = (size) => {
  const queue = [[[1]]];
  const seen = {};
  const result = [];

  for (const curr of queue) {
    if (numParts(curr) === size) {
      // console.log(stringify((curr)) + '\n');
      result.push(curr);
      continue;
    }

    for (let n of getChildPolyominoes(curr)) {
      const str = stringify(n);
      if (
        seen[str] ||
        transforms.some((t) => {
          n = t(n);
          return seen[stringify(n)];
        })
      )
        continue;

      seen[str] = true;
      queue.push(n);
    }
  }
  return result;
};

console.time();
const result = getPolyominoes(7);
console.log(result.map(stringify).join('\n\n'));
console.log(result.length);
console.timeEnd();

//////
