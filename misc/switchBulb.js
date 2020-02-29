const dirs = [
  {c: 1, r: 0},
  {c: 1, r: 1},
  {c: 0, r: 1},
  {c: -1, r: 1},
  {c: -1, r: 0},
  {c: -1, r: -1},
  {c: 0, r: -1},
  {c: 1, r: -1}
];

const getNext = ({r, c}, dir, grid) => {
  while (true) {
    r += dir.r;
    c += dir.c;
    if (grid[r] && grid[r][c]) {
      if (grid[r][c].val === 'B') return grid[r][c];
    } else return;
  }
};

const getSolution = (len, visited) => {
  const last = visited[visited.length - 1];
  for (const n of last.neighbors) {
    if (!visited.includes(n)) {
      const next = [...visited, n];
      if (next.length === len) return next.map(e => [e.r, e.c]);

      const res = getSolution(len, next);
      if (res) return res;
    }
  }
  return false;
};

const switchTheBulb = grid => {
  const bulbs = [];
  grid = grid
    .replace(/[^\n.B]/g, '')
    .trim()
    .split('\n')
    .map((row, r) =>
      row.split('').map((val, c) => {
        const o = {r, c, val};
        if (val === 'B') bulbs.push(o);
        return o;
      })
    );

  bulbs.forEach(c => {
    c.neighbors = [];
    dirs.forEach(d => {
      const n = getNext(c, d, grid);
      if (n) c.neighbors.push(n);
    });
  });

  for (let i = 0; i < bulbs.length; i++) {
    const s = getSolution(bulbs.length, [bulbs[i]]);
    if (s) return s;
  }
  return false;
};

const tests = [
  [
    [
      [1, 3],
      [5, 3]
    ],
    `+--------+
|........|
|...B....|
|........|
|........|
|........|
|...B....|
|........|
|........|
+--------+`
  ],
  [
    [
      [1, 3],
      [3, 5],
      [5, 3]
    ],
    `+--------+
|........|
|...B....|
|........|
|.....B..|
|........|
|...B....|
|........|
|........|
+--------+`
  ],
  [
    [
      [1, 3],
      [5, 3],
      [7, 5],
      [7, 1],
      [2, 1]
    ],
    `+--------+
|........|
|...B....|
|.B......|
|........|
|........|
|...B....|
|........|
|.B...B..|
+--------+`
  ],
  [
    [
      [1, 3],
      [5, 3],
      [7, 5],
      [7, 1],
      [2, 1],
      [5, 4]
    ],
    `+--------+
|........|
|...B....|
|.B......|
|........|
|........|
|...BB...|
|........|
|.B...B..|
+--------+`
  ]
];

tests.forEach(([expected, input]) => {
  const actual = JSON.stringify(switchTheBulb(input));
  expected = JSON.stringify(expected);
  if (actual === expected) {
    console.log('PASS');
  } else {
    console.log(`Expected ${expected}, got ${actual}`);
  }
});
