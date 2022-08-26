const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const pathFinder = (area) => {
  const grid = area
    .split('\n')
    .map((r, y) => [...r].map((c, x) => ({x, y, h: +c, dist: Infinity})));
  const target = grid[grid.length - 1][grid[0].length - 1];

  grid[0][0].dist = 0;
  const q = [grid[0][0]];

  while (q.length) {
    const indexOfCurrent = q.reduce(
      (minIndex, p, i) => (p.dist < q[minIndex].dist ? i : minIndex),
      0
    );
    const current = q.splice(indexOfCurrent, 1)[0];

    if (current === target) return current.dist;

    for (const [dx, dy] of dirs) {
      const n = (grid[current.y + dy] || [])[current.x + dx];
      if (!n) continue;
      const newDist = current.dist + Math.abs(n.h - current.h);
      if (newDist < n.dist) {
        n.dist = newDist;
        q.push(n);
      }
    }
  }
};

import {Test} from './test.js';
function testArea(expected, area) {
  let actual = pathFinder(area);
  Test.assertEquals(actual, expected, area);
}

testArea(
  0,
  `000
000
000`
);

testArea(
  2,
  `010
010
010`
);

testArea(
  4,
  `010
101
010`
);

testArea(
  42,
  `0707
7070
0707
7070`
);

testArea(
  14,
  `700000
077770
077770
077770
077770
000007`
);

testArea(
  0,
  `777000
007000
007000
007000
007000
007777`
);

testArea(
  4,
  `000000
000000
000000
000010
000109
001010`
);

testArea(
  24,
  `7453059
9708364
2350884
6588054
9821741
1984878
7058417`
);
