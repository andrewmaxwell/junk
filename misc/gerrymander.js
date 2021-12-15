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
    for (let c = 0; c < grid[0].length; c++) {
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
      if (seen[str]) continue;

      seen[str] = true;
      queue.push(n);
    }
  }
  return result;
};

const getCount = (grid) => {
  let result = 0;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      result += grid[i][j] ? 1 : 0;
    }
  }
  return result;
};

const putShape = (shape, grid, r, c, num) => {
  for (let i = 0; i < shape.length; i++) {
    for (let j = 0; j < shape[0].length; j++) {
      if (shape[i][j] && grid[i + r][j + c]) {
        return false;
      }
    }
  }

  const newGrid = grid.map((c) => [...c]);
  for (let i = 0; i < shape.length; i++) {
    for (let j = 0; j < shape[0].length; j++) {
      if (shape[i][j]) {
        newGrid[i + r][j + c] = num;
      }
    }
  }

  if (!newGrid[0][0]) return false;

  let max = 0;
  for (const r of newGrid) {
    for (const v of r) {
      if (v > max + 1 || (!v && max < num)) return false;
      max = Math.max(max, v);
    }
  }
  return newGrid;
};

const isValid = (grid, rows) => {
  const scores = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      scores[grid[i][j]] += rows[i][j] === 'O';
    }
  }

  let score = 0;
  for (const x of scores) score += x > 2;

  console.log(grid);
  console.log(rows.join('\n'));
  console.log(scores, score);
  return score > 2;
};

const pentominoes = getPolyominoes(5);

const gerrymander = (str) => {
  const rows = str.split('\n');
  const start = new Array(5).fill(new Array(5).fill(0));
  const queue = [start];

  while (queue.length) {
    const curr = queue.pop();
    const num = getCount(curr) / 5 + 1;

    if (num === 6) {
      if (isValid(curr, rows)) return curr.map((r) => r.join('')).join('\n');
      continue;
    } else {
      for (const s of pentominoes) {
        for (let r = 5 - s.length; r >= 0; r--) {
          for (let c = 5 - s[0].length; c >= 0; c--) {
            const newShape = putShape(s, curr, r, c, num);
            if (newShape) queue.push(newShape);
          }
        }
      }
    }
  }
  console.log('nope');
};

const exampleTests = [
  ['OOXXX', 'OOXXX', 'OOXXX', 'OOXXX', 'OOXXX'],
  ['XOXOX', 'OXXOX', 'XXOXX', 'XOXOX', 'OOXOX'],
  ['OXOOX', 'XXOXO', 'XOXXX', 'XXOXX', 'OXXOO'],
  ['XXOXO', 'XOXOX', 'OXOXO', 'XOXOX', 'XXOXX'], //null
  ['XXXXX', 'OOOXO', 'XXXOX', 'OOOOO', 'XXXXX'],
].map((e) => e.join('\n'));

exampleTests.forEach(gerrymander);
