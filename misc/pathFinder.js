const fill = (x, y, grid) => {
  if (!grid[y] || grid[y][x] !== '.') return;
  grid[y][x] = 'x';
  fill(x + 1, y, grid);
  fill(x - 1, y, grid);
  fill(x, y + 1, grid);
  fill(x, y - 1, grid);
};
const pathFinder = (maze) => {
  const grid = maze.split('\n').map((r) => r.split(''));
  fill(0, 0, grid);
  return grid.pop().pop() !== '.';
};

const {Test} = require('./test');
function testMaze(expected, maze) {
  let actual = pathFinder(maze);
  Test.assertEquals(actual, expected, maze);
}

testMaze(
  true,
  `.W.
.W.
...`
);

testMaze(
  false,
  `.W.
.W.
W..`
);

testMaze(
  true,
  `......
......
......
......
......
......`
);

testMaze(
  false,
  `......
......
......
......
.....W
....W.`
);
