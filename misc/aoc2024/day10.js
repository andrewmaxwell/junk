const grid = `89010123
78121874
87430965
96549874
45678903
32019012
01329801
10456732`
  .split('\n')
  .map((r) => [...r].map((n) => +n));

const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const getEndPoints = (x, y) =>
  grid[y][x] === 9
    ? `${x},${y}`
    : dirs.flatMap(([dx, dy]) =>
        grid[y + dy]?.[x + dx] === grid[y][x] + 1
          ? getEndPoints(x + dx, y + dy)
          : []
      );

let part1Total = 0;
let part2Total = 0;
for (let y = 0; y < grid.length; y++) {
  for (let x = 0; x < grid[y].length; x++) {
    if (grid[y][x] !== 0) continue;
    const s = getEndPoints(x, y);
    part1Total += new Set(s).size;
    part2Total += s.length;
  }
}
console.log('part1', part1Total);
console.log('part2', part2Total);
