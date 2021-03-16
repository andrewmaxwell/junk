/* eslint-disable sonarjs/no-duplicate-string */
const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'; // not actually needed, just for debugging

const getNext = (board, x, y, h, w, i) => {
  if (y + h > board.length || x + w > board[0].length) return false;
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      if (board[r][c] !== '0') return false;
    }
  }

  const nextBoard = board.map((r) => r.slice());
  for (let r = y; r < y + h; r++) {
    for (let c = x; c < x + w; c++) {
      nextBoard[r][c] = chars[i];
    }
  }
  return nextBoard;
};

function solve_puzzle(board, pieces) {
  pieces = pieces
    .map(([h, w], i) => ({w, h, i}))
    .sort((a, b) => b.w * b.h - a.w * a.h); // big pieces first

  const openCoords = [];
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[y].length; x++) {
      if (board[y][x] === '0') openCoords.push({x, y});
    }
  }
  openCoords.sort((a, b) => b.x + b.y - (a.x + a.y));

  const q = [{sol: [], b: board.map((r) => r.split(''))}];
  while (q.length) {
    const {sol, b} = q.pop(); // depth-first

    if (sol.length === pieces.length)
      return sol.sort((a, b) => a.i - b.i).map((c) => [c.y, c.x, c.z]); // back in original order

    const {w, h, i} = pieces[sol.length];
    for (const {x, y} of openCoords) {
      if (b[y][x] !== '0') continue;

      const n1 = getNext(b, x, y, h, w, i);
      if (n1) q.push({sol: [...sol, {x, y, z: 0, i}], b: n1});

      const n2 = h !== w && getNext(b, x, y, w, h, i);
      if (n2) q.push({sol: [...sol, {x, y, z: 1, i}], b: n2});
    }
  }
}

// const {Test} = require('./test');

[
  [[' 00 ', ' 00 ', ' 00 ', ' 00 '], [[2, 4]]],
  [
    ['0   0', '00000', '00000', '00000'],
    [
      [2, 1],
      [2, 1],
      [3, 1],
      [2, 5],
    ],
  ],
  [
    [
      '     0  ',
      ' 00  0  ',
      ' 00     ',
      ' 00     ',
      '   0    ',
      '       0',
      '       0',
      '0000   0',
    ],
    [
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
    ],
  ],
  [
    [
      '        ',
      ' 00 0   ',
      ' 00 00  ',
      '  0 00  ',
      '     00 ',
      '  00  0 ',
      '  00  0 ',
      '        ',
    ],
    [
      [1, 1],
      [1, 2],
      [1, 2],
      [1, 3],
      [1, 3],
      [1, 3],
      [2, 2],
    ],
  ],
  [
    [
      '            ',
      ' 00000      ',
      ' 00000      ',
      ' 00000   00 ',
      '       000  ',
      '   00  000  ',
      ' 0000 00    ',
      ' 0000 00    ',
      ' 00   000 0 ',
      '   0  000 0 ',
      ' 000      0 ',
      '            ',
    ],
    [
      [1, 1],
      [1, 1],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 3],
      [1, 3],
      [1, 4],
      [1, 4],
      [2, 2],
      [2, 2],
      [2, 3],
      [2, 3],
      [2, 5],
    ],
  ],
  [
    [
      '          ',
      '          ',
      '  00  00  ',
      '  00  00  ',
      '          ',
      ' 0  00  0 ',
      ' 00    00 ',
      '  000000  ',
      '  000000  ',
      '          ',
    ],
    [
      [1, 1],
      [1, 1],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 3],
      [1, 3],
      [1, 4],
      [2, 2],
      [2, 2],
    ],
  ],
  [
    [
      '00       00         ',
      '00       00         ',
      '00       00    0000 ',
      '0000     000000000  ',
      '0000000000 00  000  ',
      '00         00  000  ',
      '00         00  000  ',
      ' 000000000000     0 ',
      '  0000  0   0000  0 ',
      '    000000000000  0 ',
      '    000000000000 000',
      '  0000 000000000 0  ',
      '  000000 0000000 0  ',
      '      0000       0  ',
      '                 0  ',
      '               000  ',
      '  0            00   ',
      ' 000      000000    ',
      ' 00       00        ',
      '   00   00000       ',
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 4],
      [1, 4],
      [1, 4],
      [1, 4],
      [1, 6],
      [1, 12],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 3],
      [2, 3],
      [2, 4],
      [2, 4],
      [2, 5],
      [2, 7],
      [3, 5],
      [4, 7],
    ],
  ],
  [
    [
      '                    ',
      '        0000        ',
      '       000000       ',
      '      00000000      ',
      '      00000000      ',
      '      00000000      ',
      '      00000000      ',
      '      00 00 00      ',
      '     0000000000     ',
      '    000000000000    ',
      '   00000000000000   ',
      '  0000000000000000  ',
      '  0000000000000000  ',
      ' 00  0        0  00 ',
      ' 0   0        0   0 ',
      ' 0   0        0   0 ',
      '        0  0        ',
      '        0000        ',
      '         00         ',
      '                    ',
    ],
    [
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 1],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 2],
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 6],
      [1, 7],
      [1, 7],
      [1, 8],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 3],
      [2, 3],
      [2, 7],
      [2, 8],
      [3, 3],
    ],
  ],
].forEach(([board, pieces]) => {
  console.time();
  const solution = solve_puzzle(board, pieces) || [];
  console.timeEnd();

  const res = board.map((r) => r.split(''));
  for (let i = 0; i < solution.length; i++) {
    const [y, x, z] = solution[i];
    let [h, w] = pieces[i];
    if (z) [w, h] = [h, w];
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        res[r][c] = chars[i];
      }
    }
  }

  console.log(res.map((r) => r.join('')).join('\n'));
  // Test.assertEquals(
  //   res.flat().every((v) => v !== '0'),
  //   true
  // );
});
