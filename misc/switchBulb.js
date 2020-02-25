const dirs = [
  {x: 1, y: 0},
  {x: 1, y: 1},
  {x: 0, y: 1},
  {x: -1, y: 1},
  {x: -1, y: 0},
  {x: -1, y: -1},
  {x: 0, y: -1},
  {x: 1, y: -1}
];

const getNext = ({x, y}, dir, grid) => {
  for (let i = 0; i < 100; i++) {
    x += dir.x;
    y += dir.y;
    if (grid[y]) {
      if (grid[y][x] === 'B') return {x, y};
    } else return;
  }
};

const switchTheBulb = grid => {
  grid = grid.split('\n');
  const coords = [];
  grid.forEach((r, y) =>
    r.split('').forEach((c, x) => {
      if (c === 'B') coords.push({x, y});
    })
  );

  coords.forEach(c => {
    c.neighbors = [];
    dirs.forEach(d => {
      const n = getNext(c, d, grid);
      if (n) c.neighbors.push(coords.find(c => c.x === n.x && c.y === n.y));
    });
  });

  const q = [[coords[0]]];
  for (let i = 0; i < q.length; i++) {
    if (q[i].length === coords.length)
      return q[i].map(({x, y}) => [y - 1, x - 1]);
    const last = q[i][q[i].length - 1];
    for (const n of last.neighbors) {
      if (n && !q[i].includes(n)) q.push([...q[i], n]);
    }
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
