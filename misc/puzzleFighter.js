// https://www.codewars.com/kata/5a3cbf29ee1aae06160000c9/train/javascript

// const RIGHT = {x: 1, y: 0};
// const DOWN = {x: 0, y: 1};
// const LEFT = {x: -1, y: 0};
// const UP = {x: 0, y: -1};
// const dirs = [RIGHT, DOWN, LEFT, UP];

const WIDTH = 6;
const HEIGHT = 12;

class PuzzleFighter {
  constructor() {
    this.state = Array(HEIGHT)
      .fill()
      .map(() => Array(WIDTH).fill(' '));
  }
  applyMove([[gem1, gem2], moves]) {
    const gems = [
      {x: 3, y: 0, color: gem1},
      {x: 3, y: 1, color: gem2},
    ];
    moves.split('').forEach((m) => {
      if (m === 'L') gems.forEach((g) => g.x--);
      else if (m === 'R') gems.forEach((g) => g.x++);

      const minX = Math.min(...gems.map((g) => g.x));
      if (minX < 0) gems.forEach((g) => (g.x -= minX));

      const maxX = Math.max(...gems.map((g) => g.x));
      if (maxX > WIDTH) gems.forEach((g) => (g.x -= maxX - WIDTH));
    });

    gems.forEach(({x, y, color}) => {
      this.state[y][x] = color;
    });

    for (let r = HEIGHT - 1; r; r--) {
      for (let c = 0; c < WIDTH; c++) {}
    }
    this.applyGravity();

    console.log(gem1, gem2, moves);
    console.log('------\n' + this.getState() + '\n------\n\n');
  }
  getState() {
    return this.state.map((r) => r.join('')).join('\n');
  }
}

const puzzleFighter = (arr) => {
  const game = new PuzzleFighter();
  arr.forEach((m) => game.applyMove(m));
  return game.getState();
};

/*
 MOVE 1      MOVE 2      MOVE 3      MOVE 4      MOVE 5
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║      ║    ║      ║    ║      ║
║      ║    ║      ║    ║ B    ║    ║ B    ║    ║ B    ║
║B     ║    ║BB    ║    ║BB    ║    ║BB    ║    ║BB  RR║
║R     ║    ║RY    ║    ║RYG   ║    ║RYG YB║    ║RYG YB║

const gameState = [
  '      ',
  '      ',
  '      ',
  '      ',
  '      ',
  '      ',
  '      ',
  '      ',
  '      ',
  '    R ',
  ' R  YR',
  'RR  RB'
].join('\n');
*/

puzzleFighter([
  ['BR', 'LLL'],
  ['BY', 'LL'],
  // ['BG', 'ALL'],
  // ['BY', 'BRR'],
  // ['RR', 'AR'],
  // ['GY', 'A'],
  // ['BB', 'AALLL'],
  // ['GR', 'A'],
  // ['RY', 'LL'],
  // ['GG', 'L'],
  // ['GY', 'BB'],
  // ['bR', 'ALLL'],
  // ['gy', 'AAL'],
]);
