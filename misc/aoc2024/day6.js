const input = `....#.....
.........#
..........
..#.......
.......#..
..........
.#..^.....
........#.
#.........
......#...`;

const origGrid = input.split('\n').map((r) => [...r]);
const startY = origGrid.findIndex((r) => r.includes('^'));
const startX = origGrid[startY].indexOf('^');

const dirs = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const run = (grid) => {
  const moves = new Set();
  let y = startY;
  let x = startX;
  let dir = 0;

  while (true) {
    grid[y][x] = 'X';
    const [nx, ny] = [x + dirs[dir][0], y + dirs[dir][1]];
    if (!grid[ny]?.[nx]) return {hasLoop: false, grid};
    else if (grid[ny][nx] === '#') dir = (dir + 1) % 4;
    else {
      const key = [x, y, dir].join(',');
      if (moves.has(key)) break;
      moves.add(key);
      [x, y] = [nx, ny];
    }
  }
  return {hasLoop: true, grid};
};

console.log(
  'part1',
  run(origGrid.map((r) => [...r]))
    .grid.flat()
    .join('')
    .match(/X/g).length
);

////////////////

let part2Count = 0;
for (let y = 0; y < origGrid.length; y++) {
  for (let x = 0; x < origGrid[0].length; x++) {
    if (origGrid[y][x] !== '.') continue;
    const grid = origGrid.map((r) => [...r]);
    grid[y][x] = '#';
    part2Count += run(grid).hasLoop;
  }
}
console.log('part2', part2Count);
