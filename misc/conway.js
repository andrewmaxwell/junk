const dirs = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

const padCells = (cells) => {
  const empty = new Array(cells[0].length + 2).fill(0);
  return [empty, ...cells.map((r) => [0, ...r, 0]), empty];
};

const trimCells = (cells) => {
  while (cells[0].every((v) => !v)) cells = cells.slice(1);
  while (cells[cells.length - 1].every((v) => !v)) cells = cells.slice(0, -1);
  while (cells.every((r) => !r[0])) cells = cells.map((r) => r.slice(1));
  while (cells.every((r) => !r[r.length - 1]))
    cells = cells.map((r) => r.slice(0, -1));
  return cells;
};

const iterate = (cells) => {
  const p = padCells(cells);
  const r = [];
  for (let i = 0; i < p.length; i++) {
    r[i] = [];
    for (let j = 0; j < p[i].length; j++) {
      let n = 0;
      for (const [dx, dy] of dirs) n += !!(p[i + dy] || [])[j + dx];
      r[i][j] = Number(p[i][j] ? n > 1 && n < 4 : n === 3);
    }
  }
  return trimCells(r);
};

const getGeneration = (cells, generations) => {
  for (let i = 0; i < generations; i++) cells = iterate(cells);
  return cells;
};

const {Test} = require('./test');
Test.assertEquals(
  getGeneration(
    [
      [1, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
    1
  ),
  [
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 1],
  ]
);
Test.assertEquals(
  getGeneration(
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 1],
    ],
    1
  ),
  [
    [1, 0, 1],
    [0, 1, 1],
    [0, 1, 0],
  ]
);

Test.assertEquals(
  getGeneration(
    [
      [1, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    1
  ),
  [
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
  ]
);
