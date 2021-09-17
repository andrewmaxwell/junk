const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

const pad = (grid) => {
  if (grid[0].some((x) => x))
    grid = [new Array(grid[0].length).fill(0), ...grid];
  if (grid[grid.length - 1].some((x) => x))
    grid = [...grid, new Array(grid[0].length).fill(0)];
  if (grid.some((r) => r[0])) grid = grid.map((r) => [0, ...r]);
  if (grid.some((r) => r[r.length - 1])) grid = grid.map((r) => [...r, 0]);
  return grid;
};

const trim = (grid) => {
  if (!grid[0].some((x) => x)) grid = grid.slice(1);
  if (!grid[grid.length - 1].some((x) => x)) grid = grid.slice(0, -1);
  if (!grid.some((r) => r[0])) grid = grid.map((r) => r.slice(1));
  if (!grid.some((r) => r[r.length - 1]))
    grid = grid.map((r) => r.slice(0, -1));
  return grid;
};

const getChildOminoes = (grid) => {
  grid = pad(grid);
  const result = [];

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid.length; c++) {
      if (
        !grid[r][c] &&
        dirs.some((d) => grid[r + d.y] && grid[r + d.y][c + d.x])
      ) {
        let n = grid.map((r) => [...r]);
        n[r][c] = 1;
        result.push(n);
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

const getOminoes = (size) => {
  const queue = [[[1]]];
  const seen = {};
  const result = [];

  for (const curr of queue) {
    if (numParts(curr) === size) {
      // console.log(stringify(trim(curr)) + '\n');
      result.push(trim(curr));
      continue;
    }

    for (const n of getChildOminoes(curr)) {
      const str = stringify(trim(n));
      if (seen[str]) continue;
      seen[str] = true;
      queue.push(n);
    }
  }
  return result;
};

//////

const getCount = (grid) => {
  let result = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[0].length; j++) {
      result += grid[i][j] ? 1 : 0;
    }
  }
  return result;
};

const putShape = (shape, grid, r, c, num) => {
  const newGrid = grid.map((c) => [...c]);
  for (let i = 0; i < shape.length; i++) {
    for (let j = 0; j < shape[0].length; j++) {
      if (shape[i][j]) {
        if (grid[i + r][j + c]) return false;
        // if (!grid[i - 1])
        newGrid[i + r][j + c] = num;
      }
    }
  }

  if (!newGrid[0][0]) return false;

  let max = 0;
  for (const r of newGrid) {
    for (const v of r) {
      if (v > max + 1) return false;
      max = Math.max(max, v);
    }
  }
  return newGrid;
};

const colors = [
  '\x1b[30m', // black
  '\x1b[31m', // red,
  '\x1b[33m', // yellow
  '\x1b[32m', // green
  '\x1b[34m', // blue
  '\x1b[35m', // magenta
];

const getCombos = (size) => {
  const start = new Array(size).fill(new Array(size).fill(0));
  const queue = [start];
  const ominoes = getOminoes(size);
  const result = [];

  while (queue.length) {
    const curr = queue.pop();
    // await new Promise((r) => setTimeout(r, 1000));
    const num = getCount(curr) / size + 1;

    if (num === size + 1) {
      console.log(
        curr
          .map((r) => r.flatMap((v) => [colors[v], '#']).join(''))
          .join('\n') + '\n'
      );
      result.push(curr);
      console.log(result.length);
      continue;
    }

    for (const s of ominoes) {
      for (let r = 0; r < size - s.length + 1; r++) {
        for (let c = 0; c < size - s[0].length + 1; c++) {
          const newShape = putShape(s, curr, r, c, num);
          if (newShape) queue.push(newShape);
        }
      }
    }
  }
  return result;
};

console.log('\x1b[0m', getCombos(5).length);
