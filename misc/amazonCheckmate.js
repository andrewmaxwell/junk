const SAFE = 0;
const CHECK = 1;
const IMPOSSIBLE = 2;
const dirs = [
  {x: 1, y: 0},
  {x: 1, y: 1},
  {x: 0, y: 1},
  {x: -1, y: 1},
  {x: -1, y: 0},
  {x: -1, y: -1},
  {x: 0, y: -1},
  {x: 1, y: -1}
];
const knightMoves = [
  {x: 2, y: 1},
  {x: 1, y: 2},
  {x: -1, y: 2},
  {x: -2, y: 1},
  {x: -2, y: -1},
  {x: -1, y: -2},
  {x: 1, y: -2},
  {x: 2, y: -1}
];
const toCoords = str => [str.charCodeAt(0) - 97, str[1] - 1];

class Board {
  constructor() {
    this.board = [...Array(8)].map(() => Array(8).fill(SAFE));
  }
  get(x, y) {
    return this.board[y] && this.board[y][x];
  }
  set(x, y, val) {
    if (this.board[y] && this.board[y][x] === SAFE) this.board[y][x] = val;
  }
  eachSquare(func) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        func(this.board[y][x], x, y);
      }
    }
  }
}

const amazonCheckmate = (king, amazon) => {
  const [kx, ky] = toCoords(king);
  const [ax, ay] = toCoords(amazon);
  const board = new Board();

  board.set(kx, ky, IMPOSSIBLE);
  dirs.forEach(d => board.set(kx + d.x, ky + d.y, IMPOSSIBLE));
  knightMoves.forEach(d => board.set(ax + d.x, ay + d.y, CHECK));
  dirs.forEach(d => {
    for (let j = 1; j < 8; j++) {
      const x = ax + d.x * j;
      const y = ay + d.y * j;
      if (kx === x && ky === y) break;
      board.set(x, y, CHECK);
    }
  });

  const result = [0, 0, 0, 0];
  board.eachSquare((v, x, y) => {
    if (v === IMPOSSIBLE) return;
    const safe = v === SAFE;
    const canMove = dirs.some(d => board.get(x + d.x, y + d.y) === SAFE);
    if (!safe && !canMove) result[0]++;
    else if (!safe && canMove) result[1]++;
    else if (safe && !canMove && (x !== ax || y !== ay)) result[2]++;
    else if (safe && canMove) result[3]++;
  });
  return result;
};

/*
Checkmate, Check, Stalemate, Safe

*/

const {Test} = require('./test.js');
Test.assertDeepEquals(amazonCheckmate('d3', 'e4'), [5, 21, 0, 29]);
Test.assertDeepEquals(amazonCheckmate('a1', 'g5'), [0, 29, 1, 29]);
Test.assertDeepEquals(amazonCheckmate('a3', 'e4'), [1, 32, 1, 23]);
Test.assertDeepEquals(amazonCheckmate('f3', 'f2'), [6, 11, 0, 38]);
Test.assertDeepEquals(amazonCheckmate('b7', 'a8'), [0, 10, 0, 45]);
Test.assertDeepEquals(amazonCheckmate('f7', 'd3'), [4, 28, 1, 21]);
Test.assertDeepEquals(amazonCheckmate('g2', 'c3'), [9, 21, 0, 24]);
Test.assertDeepEquals(amazonCheckmate('f3', 'c1'), [4, 18, 0, 32]);
Test.assertDeepEquals(amazonCheckmate('d4', 'h8'), [0, 18, 0, 36]);
