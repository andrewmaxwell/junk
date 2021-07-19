const dirs = {
  Right: {x: 1, y: 0, next: 'Down'},
  Down: {x: 0, y: 1, next: 'Left'},
  Left: {x: -1, y: 0, next: 'Up'},
  Up: {x: 0, y: -1, next: 'Right'},
};

const isEmpty = (rows, x, y) => rows[y] && rows[y][x] === '.';

const move = (rows, {x, y}, dir) => {
  let d = dirs[dir];
  if (!isEmpty(rows, x + d.x, y + d.y)) return false;
  rows = rows.map((r) => [...r]);
  while (true) {
    if (isEmpty(rows, x + d.x, y + d.y)) {
      x += d.x;
      y += d.y;
      rows[y][x] = 'x';
    } else {
      d = dirs[d.next];
      if (!isEmpty(rows, x + d.x, y + d.y)) break;
    }
  }
  return rows;
};

const removeIndex = (arr, i) => {
  const n = [...arr];
  n.splice(i, 1);
  return n;
};

const findSolution = (rows, blocks, solution = []) => {
  if (!blocks.length && rows.every((r) => r.every((c) => c !== '.')))
    return solution;

  for (let i = 0; i < blocks.length; i++) {
    const remainingBlocks = removeIndex(blocks, i);
    for (const dir in dirs) {
      const newRows = move(rows, blocks[i], dir);
      if (!newRows) continue;
      const s = findSolution(newRows, remainingBlocks, [
        ...solution,
        [blocks[i].y, blocks[i].x, dir],
      ]);
      if (s) return s;
    }
  }
  return false;
};

const playFlou = (gameMap) => {
  const rows = gameMap
    .split('\n')
    .slice(1, -1)
    .map((r) => r.split('').slice(1, -1));

  const blocks = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] === 'B') blocks.push({x, y});
    }
  }

  return findSolution(rows, blocks);
};

////////////////////

const {Test} = require('./test');

const checkSolution = (gameMap, solution) => {
  if (!solution) return false;
  let rows = gameMap
    .split('\n')
    .slice(1, -1)
    .map((r) => r.split('').slice(1, -1));
  for (let i = 0; i < solution.length; i++) {
    console.log(i, solution[i]);
    rows = move(rows, {x: solution[i][1], y: solution[i][0]}, solution[i][2]);
    console.log(rows.map((r) => r.join('')).join('\n') + '\n');
    if (!rows) return 'BAD';
  }
  return rows.every((r) => r.every((c) => c !== '.')) && 'Passed!';
};

/* eslint-disable no-redeclare */
var gameMap = `+----+
|B...|
|....|
|....|
|....|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|B...|
|....|
|....|
|...B|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|.B..|
|....|
|....|
|..B.|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|.BB.|
|....|
|....|
|....|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|B...|
|B...|
|....|
|....|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|B..B|
|....|
|....|
|.B..|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|....|
|B...|
|B...|
|...B|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|...B|
|B...|
|....|
|..B.|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|B..B|
|....|
|....|
|...B|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+----+
|....|
|...B|
|.B..|
|B...|
+----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|.....|
|....B|
|...B.|
|.....|
|....B|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|B....|
|.B...|
|.B...|
|.....|
|.....|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|BB.BB|
|.....|
|.....|
|.....|
|.....|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|..B..|
|.....|
|.....|
|..B..|
|.....|
+-----+`; // [[0, 2, 'Right'], [3, 2, 'Up']]
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|...BB|
|.....|
|.....|
|B....|
|.....|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|.....|
|.B.B.|
|.B...|
|.....|
|...B.|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|.....|
|B....|
|.B...|
|.B..B|
|.....|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|.BB..|
|.....|
|.....|
|..BB.|
|.....|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|.....|
|BB...|
|..B..|
|..B..|
|..B..|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+-----+
|...B.|
|.....|
|...B.|
|.BB..|
|.....|
+-----+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|B.....|
|......|
|.....B|
|..B...|
|......|
|.....B|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|..BB..|
|......|
|......|
|..BB..|
|......|
|......|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|......|
|......|
|....B.|
|.B....|
|......|
|B...B.|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|B.....|
|..B...|
|...B..|
|..B...|
|......|
|......|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|B.....|
|......|
|...B..|
|...B..|
|...B..|
|...B..|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|......|
|BB....|
|......|
|...B..|
|......|
|....BB|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|......|
|.B..B.|
|......|
|......|
|......|
|B.B..B|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|B.....|
|B.....|
|......|
|....B.|
|....B.|
|....B.|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|......|
|BBB...|
|......|
|......|
|..BB..|
|......|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(checkSolution(gameMap, yoursolution), 'Passed!');

var gameMap = `+------+
|......|
|......|
|......|
|..B...|
|......|
|......|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(yoursolution, false, 'Should return false if no solution');

var gameMap = `+------+
|BB....|
|B.....|
|......|
|......|
|......|
|......|
+------+`;
var yoursolution = playFlou(gameMap);
Test.assertEquals(yoursolution, false, 'Should return false too');
