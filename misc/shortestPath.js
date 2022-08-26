const dirs = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function wire_DHD_SG1(existingWires) {
  const grid = existingWires
    .split('\n')
    .map((r, y) => [...r].map((c, x) => ({x, y, c, dist: Infinity})));

  const q = [].concat(...grid).filter((o) => o.c === 'S');
  q[0].dist = 0;

  while (q.length) {
    const minIndex = q.reduce((m, o, i) => (o.dist < q[m].dist ? i : m), 0);
    const coord = q.splice(minIndex, 1)[0];

    if (coord.c === 'G') {
      let curr = coord.prev;
      while (curr.prev) {
        curr.c = 'P';
        curr = curr.prev;
      }
      return grid.map((r) => r.map((o) => o.c).join('')).join('\n');
    }

    for (const [dx, dy] of dirs) {
      const n = (grid[coord.y + dy] || [])[coord.x + dx];
      if (!n) continue;
      const newDist = coord.dist + (dx & dy ? Math.SQRT2 : 1);
      if ((n.c === '.' || n.c === 'G') && newDist < n.dist) {
        n.dist = newDist;
        n.prev = coord;
        q.push(n);
      }
    }
  }
  return 'Oh for crying out loud...';
}

import {Test, it} from './test.js';
var existingWires, solution;
it('No solution', function () {
  existingWires = `SX.
XX.
..G`;
  solution = 'Oh for crying out loud...';
  Test.assertEquals(wire_DHD_SG1(existingWires), solution);
});
it('3x3', function () {
  existingWires = `SX.
X..
XXG`;
  solution = `SX.
XP.
XXG`;
  Test.assertEquals(wire_DHD_SG1(existingWires), solution);

  existingWires = `.S.
...
.G.`;
  solution = `.S.
.P.
.G.`;
  Test.assertEquals(wire_DHD_SG1(existingWires), solution);

  existingWires = `...
S.G
...`;

  solution = `...
SPG
...`;
  Test.assertEquals(wire_DHD_SG1(existingWires), solution);

  existingWires = `...
SG.
...`;
  solution = `...
SG.
...`;
  Test.assertEquals(wire_DHD_SG1(existingWires), solution);
});
it('5x5', function () {
  existingWires = `.S...
XXX..
.X.XX
..X..
G...X`;
  solution = `.SP..
XXXP.
.XPXX
.PX..
G...X`;
  Test.assertEquals(wire_DHD_SG1(existingWires), solution);
});
it('10x10', function () {
  existingWires = `XX.S.XXX..
XXXX.X..XX
...X.XX...
XX...XXX.X
....XXX...
XXXX...XXX
X...XX...X
X...X...XX
XXXXXXXX.X
G........X`;
  var solutionsSet = [
    `XX.S.XXX..
XXXXPX..XX
...XPXX...
XX.P.XXX.X
...PXXX...
XXXXPP.XXX
X...XXP..X
X...X..PXX
XXXXXXXXPX
GPPPPPPP.X`,
    `XX.S.XXX..
XXXXPX..XX
...XPXX...
XX..PXXX.X
...PXXX...
XXXXPP.XXX
X...XXP..X
X...X..PXX
XXXXXXXXPX
GPPPPPPP.X`,
  ];
  var actual = wire_DHD_SG1(existingWires);
  Test.expect(
    solutionsSet.includes(actual),
    `Your solution:\n${actual}\n\nShould be either:\n${solutionsSet[0]}\n\nor:\n${solutionsSet[1]}`
  );
});
