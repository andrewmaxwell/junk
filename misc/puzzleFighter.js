// https://www.codewars.com/kata/5a3cbf29ee1aae06160000c9/train/javascript

const RIGHT = {x: 1, y: 0};
const DOWN = {x: 0, y: 1};
const LEFT = {x: -1, y: 0};
const UP = {x: 0, y: -1};
const dirs = [RIGHT, DOWN, LEFT, UP];

const WIDTH = 6;
const HEIGHT = 12;

const copy = (ob) =>
  Array.isArray(ob)
    ? ob.map(copy)
    : ob && typeof ob === 'object'
    ? Object.fromEntries(Object.keys(ob).map((k) => [k, copy(ob[k])]))
    : ob;

class PuzzleFighter {
  constructor() {
    this.gems = [];
    this.frames = [];
  }
  applyMove([[gem1, gem2], moves]) {
    let x = 3;
    let dir = DOWN;
    moves.split('').forEach((m) => {
      if (m === 'L' && x > (dir === LEFT ? 1 : 0)) x--;
      else if (m === 'R' && x < WIDTH - (dir === RIGHT ? 2 : 1)) x++;
      else if (m === 'A')
        dir = dirs[(dirs.indexOf(dir) + dirs.length - 1) % dirs.length];
      else if (m === 'B') dir = dirs[(dirs.indexOf(dir) + 1) % dirs.length];
    });

    const gems = [
      {x, y: dir === UP ? 1 : 0, color: gem1, w: 1, h: 1},
      {x: x + dir.x, y: dir.y + (dir === UP ? 1 : 0), color: gem2, w: 1, h: 1},
    ];
    this.gems.push(...gems);

    this.applyChanges();

    console.log('\n\n-------\n', gem1 + gem2, moves);
    console.log('------\n' + this.getState() + '\n------\n\n');
  }
  getGemColor(x, y) {
    const g = this.gems.find(
      (g) => x >= g.x && y >= g.y && x < g.x + g.w && y < g.y + g.h
    );
    return g ? g.color : ' ';
  }
  applyChanges() {
    let falling = true;
    this.gems.sort((a, b) => b.y + b.h - (a.y + a.h));
    this.saveFrame();
    while (falling) {
      falling = false;
      this.gems.forEach((gem) => {
        while (this.canFall(gem)) {
          gem.y++;
          this.saveFrame();
          falling = true;
        }
      });
    }

    this.gems.forEach((g) => {
      if (!/[a-z]/.test(g.color)) return;
      const color = g.color.toUpperCase();

      const q = [{x: g.x, y: g.y}];
      for (const c of q) {
        for (const d of dirs) {
          const x = d.x + c.x;
          const y = d.y + c.y;
          if (
            this.getGemColor(x, y) === color &&
            q.every((m) => m.x !== x || m.y !== y)
          )
            q.push({x, y});
        }
      }

      if (q.length === 1) return;

      this.gems = this.gems.filter(
        (g) =>
          !q.some(
            ({x, y}) => x >= g.x && y >= g.y && x < g.x + g.w && y < g.y + g.h
          )
      );

      this.applyChanges();
    });
  }
  canFall(gem) {
    const y = gem.y + gem.h;
    if (y > HEIGHT - 1) return false;
    for (let i = 0; i < gem.w; i++) {
      if (this.getGemColor(gem.x + i, y) !== ' ') return false;
    }
    return true;
  }

  getState() {
    const result = [];
    for (let y = 0; y < HEIGHT; y++) {
      result[y] = '';
      for (let x = 0; x < WIDTH; x++) {
        result[y] += this.getGemColor(x, y);
      }
    }
    return result.join('\n');
  }
  saveFrame() {
    this.frames.push(copy(this.gems));
  }
  render() {
    const container = document.createElement('div');
    container.className = 'container';

    let index = 0;
    const draw = () => {
      container.innerHTML = this.frames[index % this.frames.length].map(
        ({x, y, w, h, color}) =>
          `<div class="gem gem${color}" style="top: ${y * 32}px; left: ${
            x * 32
          }px; width: ${w * 32}px; height: ${h * 32}px"></div>`
      );

      index++;
      setTimeout(draw, 500);
    };
    draw();
    return container;
  }
}

const puzzleFighter = (arr) => {
  const game = new PuzzleFighter();
  arr.forEach((m) => game.applyMove(m));
  return game.getState();
};

const {Test} = require('./test');

const verify = (result, [finalState, moves]) => {
  const game = new PuzzleFighter();
  for (const [move, expected] of moves) {
    game.applyMove(move);
    Test.assertSimilar(game.getState(), expected);
  }
};

// let test1 = [
//   ['BR', 'LLL'],
//   ['BY', 'LL'],
//   ['BG', 'ALL'],
//   ['BY', 'BRR'],
//   ['RR', 'AR'],
//   ['GY', 'A'],
//   ['BB', 'AALLL'],
//   ['GR', 'A'],
//   ['RY', 'LL'],
//   ['GG', 'L'],
//   ['GY', 'BB'],
//   ['bR', 'ALLL'],
//   ['gy', 'AAL'],
// ];
// let gameState1 =
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n    R \n R  YR\nRR  RB';
// let gameStateSequence1 = [
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nB     \nR     ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nBB    \nRY    ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n B    \nBB    \nRYG   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n B    \nBB    \nRYG YB',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n B    \nBB  RR\nRYG YB',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n B  Y \nBB  RR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n      \nB     \nBB  Y \nBB  RR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n      \nB   R \nBB  Y \nBB GRR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBY  R \nBB  Y \nBB GRR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBY  R \nBBG Y \nBBGGRR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBY YR \nBBGGY \nBBGGRR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n      \n R YR \n RGGY \n YGGRR\nRYGGYB',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n    R \n R  YR\nRR  RB',
// ];
// verify(puzzleFighter(test1), [
//   gameState1,
//   gameStateSequence1.map((e, i) => [test1[i], e]),
// ]);

// let test2 = [
//   ['GR', 'ALLL'],
//   ['GG', 'ALLL'],
//   ['RG', 'AAL'],
//   ['RB', 'BLL'],
//   ['RG', 'ALL'],
//   ['BB', 'RR'],
//   ['BR', 'BB'],
//   ['BR', 'ALLL'],
//   ['YB', 'R'],
//   ['BG', 'BBRR'],
//   ['YR', 'AAR'],
//   ['RR', 'L'],
//   ['RR', 'ABLL'],
//   ['GY', 'BRR'],
//   ['BB', 'R'],
//   ['gB', 'RR'],
//   ['BR', 'ALL'],
//   ['Gr', 'BB'],
//   ['Rb', 'R'],
//   ['GG', 'B'],
//   ['bB', 'LL'],
// ];
// let gameState2 =
//   '      \n      \n      \n      \n      \n      \n      \n    R \n  GGY \n  GGYB\nGGGRYB\nGRRBBB';
// let gameStateSequence2 = [
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nGR    ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nGG    \nGR    ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nGGG   \nGRR   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \nBR    \nGGG   \nGRR   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n R    \nBRG   \nGGG   \nGRR   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n R    \nBRG   \nGGG  B\nGRR  B',
//   '      \n      \n      \n      \n      \n      \n      \n      \n R    \nBRG   \nGGGR B\nGRRB B',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBR    \nBRG   \nGGGR B\nGRRB B',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBR    \nBRG   \nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBR   G\nBRG  B\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n      \n      \n R    \nBR  RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n      \n      \n RR   \nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n R    \n R    \n RR   \nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n R    \n R    \n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n R  B \n R  B \n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n R  Bg\n R  BB\n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n B    \n R  Bg\n RR BB\n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n     g\n    BB\n    BG\nB   YG\nBBGGYB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n      \n      \n    R \nB   Y \nBBGGYB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n      \n      \n    R \nB GGY \nBBGGYB\nGGGRYB\nGRRBBB',
//   '      \n      \n      \n      \n      \n      \n      \n    R \n  GGY \n  GGYB\nGGGRYB\nGRRBBB',
// ];
// verify(puzzleFighter(test2), [
//   gameState2,
//   gameStateSequence2.map((e, i) => [test2[i], e]),
// ]);

let test3 = [
  ['RR', 'LLL'],
  ['GG', 'LL'],
  ['RG', 'BBL'],
  ['GY', 'AR'],
  ['RR', 'BBLLL'],
  ['RB', 'AALL'],
  ['GR', 'B'],
  ['GB', 'AR'],
  ['RR', ''],
  ['GG', 'R'],
  ['YR', 'BR'],
  ['RR', 'LLL'],
  ['BR', 'AALL'],
  ['Bg', ''],
  ['RR', 'BBBBLLL'],
  ['GR', 'ALLL'],
  ['bR', 'L'],
  ['YG', 'BBBALL'],
  ['RR', 'L'],
  ['YB', 'AL'],
];
let gameState3 =
  '      \n      \n      \nGG    \nRY    \nRRYB  \nRRRB  \nR RgY \nR RRG \nRRRRG \nRGGRGB\nRGRGGY';
let gameStateSequence3 = [
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nR     \nR     ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nRG    \nRG    ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nRGG   \nRGR   ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nRGG   \nRGR GY',
  '      \n      \n      \n      \n      \n      \n      \n      \nR     \nR     \nRGG   \nRGR GY',
  '      \n      \n      \n      \n      \n      \n      \n      \nRB    \nRR    \nRGG   \nRGR GY',
  '      \n      \n      \n      \n      \n      \n      \n      \nRB    \nRRR   \nRGG   \nRGRGGY',
  '      \n      \n      \n      \n      \n      \n      \n      \nRB    \nRRR   \nRGG GB\nRGRGGY',
  '      \n      \n      \n      \n      \n      \n      \n      \nRB    \nRRRR  \nRGGRGB\nRGRGGY',
  '      \n      \n      \n      \n      \n      \n      \n      \nRB  G \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \n      \n      \n      \n      \n    Y \nRB RG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \n      \n      \n      \nR     \nR   Y \nRB RG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \n      \n      \n      \nRR    \nRB  Y \nRB RG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \n      \n      \n      \nRR B  \nRB gY \nRB RG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \n      \nR     \nR     \nRR B  \nRB gY \nRB RG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \nG     \nR     \nRR    \nRR B  \nRB gY \nRB RG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \nG     \nR     \nRR    \nRR B  \nR  gY \nR RRG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \nGG    \nRY    \nRR    \nRR B  \nR  gY \nR RRG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \nGG    \nRY    \nRR    \nRRRB  \nR RgY \nR RRG \nRRRRG \nRGGRGB\nRGRGGY',
  '      \n      \n      \nGG    \nRY    \nRRYB  \nRRRB  \nR RgY \nR RRG \nRRRRG \nRGGRGB\nRGRGGY',
];
verify(puzzleFighter(test3), [
  gameState3,
  gameStateSequence3.map((e, i) => [test3[i], e]),
]);

// let test4 = [
//   ['BB', 'LLLL'],
//   ['BB', 'LL'],
//   ['BB', 'L'],
//   ['BB', 'LLL'],
//   ['BB', 'LL'],
//   ['BG', 'L'],
//   ['BB', ''],
//   ['BB', 'R'],
//   ['RB', 'BBRRR'],
//   ['RR', 'LLL'],
//   ['RR', 'BALL'],
//   ['RR', ''],
//   ['RR', 'R'],
//   ['RR', 'L'],
//   ['RR', 'B'],
//   ['RR', 'LLL'],
//   ['RR', 'LL'],
//   ['RR', 'BLLL'],
//   ['RR', 'B'],
//   ['YR', 'ALL'],
//   ['GR', 'AL'],
//   ['Rb', 'RRRR'],
// ];
// let gameState4 =
//   '      \n      \n      \n      \n YG   \nRRR   \nRRR   \nRRRR  \nRRRR  \nRRRR  \n   RRR\n  GRRR';
// let gameStateSequence4 = [
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nB     \nB     ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nBB    \nBB    ',
//   '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBB   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \nB     \nB     \nBBB   \nBBB   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \nBB    \nBB    \nBBB   \nBBB   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBB   \nBBB   ',
//   '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBBB  \nBBBB  ',
//   '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBBBB \nBBBBB ',
//   '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n      \n      \nR     \nR     \nBBB   \nBBG   \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n      \n      \nRR    \nRR    \nBBB   \nBBG   \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n      \n      \nRR    \nRR    \nBBBR  \nBBGR  \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n      \n      \nRR    \nRR    \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n      \n      \nRRR   \nRRR   \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n      \n  R   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \nR     \nR R   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \nRR    \nRRR   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \nRR    \nRR    \nRRR   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \nRR    \nRRR   \nRRR   \nRRRR  \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n Y    \nRRR   \nRRR   \nRRR   \nRRRR  \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n YG   \nRRR   \nRRR   \nRRRR  \nRRRR  \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
//   '      \n      \n      \n      \n YG   \nRRR   \nRRR   \nRRRR  \nRRRR  \nRRRR  \n   RRR\n  GRRR',
// ];
// verify(puzzleFighter(test4), [
//   gameState4,
//   gameStateSequence4.map((e, i) => [test4[i], e]),
// ]);
