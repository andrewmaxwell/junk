const dirs = [
  {x: 1, y: 0, dir: 'r'},
  {x: 0, y: 1, dir: 'd'},
  {x: -1, y: 0, dir: 'l'},
  {x: 0, y: -1, dir: 'u'},
];

const getNeighbor = (grid, {x, y}, dir) => {
  let prev;
  for (let i = 1; i < 1e3; i++) {
    const cell = grid[y + dir.y * i] && grid[y + dir.y * i][x + dir.x * i];
    if (!cell || cell.v === '#') return {dist: i - 1, cell: prev, dir: dir.dir};
    if (cell.v === 'x' || cell.v === 'E') return {dist: i, cell, dir: dir.dir};
    prev = cell;
  }
};

const IceMazeSolver = (map) => {
  const grid = map
    .split('\n')
    .map((r, y) =>
      r.split('').map((v, x) => ({x, y, v, moves: Infinity, dist: Infinity}))
    );
  const q = [];
  grid.forEach((row) => {
    row.forEach((cell) => {
      cell.neighbors = dirs
        .map((dir) => getNeighbor(grid, cell, dir))
        .filter((n) => n && n.dist);
      if (cell.v === 'S') q.push(cell);
    });
  });

  console.log(grid);

  q[0].moves = q[0].dist = 0;

  while (q.length) {
    let indexOfMin = 0;
    for (let i = 1; i < q.length; i++) {
      if (
        q[i].dist < q[indexOfMin].dist ||
        (q[i].dist === q[indexOfMin].dist && q[i].moves < q[indexOfMin].moves)
      ) {
        indexOfMin = i;
      }
    }
    const current = q.splice(indexOfMin, 1)[0];
    current.visited = true;

    if (current.v === 'E') {
      const result = [];
      let c = current;
      while (c.prev) {
        result.push(c.prev.dir);
        c = c.prev.cell;
      }
      return result.reverse();
    }

    for (const {dist, cell, dir} of current.neighbors) {
      if (cell.visited) continue;
      if (current.dist + dist < cell.dist) {
        cell.dist = current.dist + dist;
        cell.moves = current.moves + 1;
        cell.prev = {dir, cell: current};
        q.push(cell);
      }
    }
  }
  return null;
};

// const {Test} = require('./test.js');

var map;
// map = '\
//     x \n\
//   #   \n\
//    E  \n\
//  #    \n\
//     # \n\
// S    #';
// console.log(map);
// Test.assertSimilar(
//   IceMazeSolver(map),
//   ['u', 'r', 'd', 'l', 'u', 'r'],
//   'A simple spiral'
// );
// map = '\
//  #    \n\
// x   E \n\
//       \n\
//      S\n\
//       \n\
//  #    ';
// console.log(map);
// Test.assertSimilar(
//   IceMazeSolver(map),
//   ['l', 'u', 'r'],
//   'Slippery puzzles has one-way routes'
// );
// map = '\
// E#    \n\
//       \n\
//       \n\
//       \n\
//       \n\
//  #   S';
// console.log(map);
// Test.assertSimilar(IceMazeSolver(map), null, 'The end is unreachable');
map = '\
E#   #\n\
      \n\
#     \n\
  #   \n\
 #    \n\
 S    ';
console.log(map);
IceMazeSolver(map);
// Test.assertSimilar(
//   IceMazeSolver(map),
//   ['r', 'u', 'l', 'u'],
//   'Tiebreak by least number of moves first'
// );
// map = '\
//     E \n\
//      #\n\
//       \n\
// # #   \n\
//     # \n\
//  #  S ';
// console.log(map);
// Test.assertSimilar(
//   IceMazeSolver(map),
//   ['l', 'u', 'r', 'u', 'r'],
//   'Then by total distance traversed'
// );
