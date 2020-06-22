// const dirs = [
//   [1, 0], // right
//   [0, 1], // down
//   [-1, 0], // left
//   [0, -1], // up
// ];

const exit_from_maze = (board) => {
  const position = [
    board.find((r) => r.includes('*')).indexOf('*'),
    board.findIndex((r) => r.includes('*')),
  ];
  let dir = position[0]
    ? position[1]
      ? position[1] === board.length - 1
        ? 3
        : 2
      : 1
    : 0;
  for (let distance = 0; distance < 1e5; distance++) {
    position[0] += [1, 0, -1, 0][dir];
    position[1] += [0, 1, 0, -1][dir];
    const c = board[position[1]][position[0]];
    if (c === '/') dir = [3, 2, 1, 0][dir];
    else if (c === '\\') dir = [1, 0, 3, 2][dir];
    else if (c === '#') return {position, distance};
  }
};

const {Test} = require('./test');
let board = [
  '##############',
  '#        \\   #',
  '*   \\        #',
  '#            #',
  '#   \\    /   #',
  '##############',
];
let res = {
  position: [0, 1],
  distance: 22,
};
Test.assertEquals(exit_from_maze(board), res);
