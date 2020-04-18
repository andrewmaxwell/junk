const dirs = [
  {dx: 1, dy: 0, dir: 'r'},
  {dx: 0, dy: 1, dir: 'd'},
  {dx: -1, dy: 0, dir: 'l'},
  {dx: 0, dy: -1, dir: 'u'},
];

const getNeighbor = (map, {x, y}, {dx, dy, dir}) => {
  for (let dist = 1; dist; dist++) {
    const cell = map[y + dy * dist] && map[y + dy * dist][x + dx * dist];
    if (!cell || cell.v !== ' ') {
      if (!cell || cell.v === '#') dist--;
      return {dist, cell: map[y + dy * dist][x + dx * dist], dir};
    }
  }
};

const parseMap = (map) => {
  map = map
    .split('\n')
    .map((r, y) =>
      r.split('').map((v, x) => ({x, y, v, moves: Infinity, dist: Infinity}))
    );
  map.forEach((row) => {
    row.forEach((cell) => {
      cell.neighbors = dirs
        .map((dir) => getNeighbor(map, cell, dir))
        .filter((n) => n.dist);
    });
  });
  return map;
};

const findStart = (map) =>
  map.reduce((a, row) => a || row.find((cell) => cell.v === 'S'), null);

const getIndex = (q) =>
  q.reduce(
    (m, {moves, dist}, i) =>
      moves < q[m].moves || (moves === q[m].moves && dist < q[m].dist) ? i : m,
    0
  );

const getResult = ({prev}) => (prev ? [...getResult(prev.cell), prev.dir] : []);

const IceMazeSolver = (map) => {
  map = parseMap(map);

  const q = [findStart(map)];
  q[0].moves = q[0].dist = 0;

  while (q.length) {
    const current = q.splice(getIndex(q), 1)[0];

    if (current.v === 'E') return getResult(current);
    for (const {dist, cell, dir} of current.neighbors) {
      if (
        current.moves + 1 < cell.moves ||
        (current.moves + 1 === cell.moves && current.dist + dist < cell.dist)
      ) {
        cell.dist = current.dist + dist;
        cell.moves = current.moves + 1;
        cell.prev = {dir, cell: current};
        q.push(cell);
      }
    }
  }
  return null;
};

const {Test} = require('./test.js');

var map;
map = '\
    x \n\
  #   \n\
   E  \n\
 #    \n\
    # \n\
S    #';
console.log(map);
Test.assertSimilar(
  IceMazeSolver(map),
  ['u', 'r', 'd', 'l', 'u', 'r'],
  'A simple spiral'
);
map = '\
 #    \n\
x   E \n\
      \n\
     S\n\
      \n\
 #    ';
console.log(map);
Test.assertSimilar(
  IceMazeSolver(map),
  ['l', 'u', 'r'],
  'Slippery puzzles has one-way routes'
);
map = '\
E#    \n\
      \n\
      \n\
      \n\
      \n\
 #   S';
console.log(map);
Test.assertSimilar(IceMazeSolver(map), null, 'The end is unreachable');
map = '\
E#   #\n\
      \n\
#     \n\
  #   \n\
 #    \n\
 S    ';
console.log(map);
IceMazeSolver(map);
Test.assertSimilar(
  IceMazeSolver(map),
  ['r', 'u', 'l', 'u'],
  'Tiebreak by least number of moves first'
);
map = '\
    E \n\
     #\n\
      \n\
# #   \n\
    # \n\
 #  S ';
console.log(map);
Test.assertSimilar(
  IceMazeSolver(map),
  ['l', 'u', 'r', 'u', 'r'],
  'Then by total distance traversed'
);
map = `x       x #
x x   x   #
#         #
  # x     E
  x x     #
  x   x   #
          #
S       x #`;
console.log(map);
Test.assertSimilar(IceMazeSolver(map), [
  'r',
  'u',
  'l',
  'd',
  'r',
  'r',
  'd',
  'l',
  'u',
  'r',
  'u',
  'r',
]);
