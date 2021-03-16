const dirs = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
const spiralize = (size) => {
  const r = [...Array(size)].map(() => Array(size).fill(0));

  let x = 0;
  let y = 0;
  let dir = 0;

  while (
    dirs.reduce((s, [dy, dx]) => ((r[y + dy] || {})[x + dx] ? s + 1 : s), 0) < 2
  ) {
    r[y][x] = 1;

    const [ys, xs] = dirs[dir];
    x += xs;
    y += ys;

    if (
      (r[y + ys] || {})[x + xs] === undefined ||
      (r[y + ys * 2] || {})[x + xs * 2] === 1
    )
      dir = (dir + 1) % 4;
  }

  return r;
};

const {Test} = require('./test');
Test.assertSimilar(spiralize(5), [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 1],
  [1, 1, 1, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1],
]);
Test.assertSimilar(spiralize(8), [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
]);
Test.assertEquals(
  spiralize(10),
  `1111111111
0000000001
1111111101
1000000101
1011110101
1010010101
1010000101
1011111101
1000000001
1111111111`
    .split('\n')
    .map((r) => r.split('').map(Number))
);
