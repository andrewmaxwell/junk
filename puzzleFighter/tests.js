// nodemon -r esm --harmony puzzleFighter/tests.js

import {PuzzleFighter} from './main.js';

const assertEquals = (actual, expected, description) => {
  if (description) console.log(description);
  if (actual === expected) console.log('\x1b[32m%s\x1b[0m', 'PASS');
  else
    console.log(
      '\x1b[31m%s\x1b[0m',
      // `Expected ${toString(expected)}, got ${toString(actual)}`
      `Expected ${expected}, got ${actual}`
    );
};

const puzzleFighter = () => {};
const verify = (result, [finalState, moves]) => {
  const game = new PuzzleFighter();
  for (const [move, expected] of moves) {
    game.applyMove(move);
    assertEquals(game.getState(), expected);
  }
};

let test1 = [
  ['BR', 'LLL'],
  ['BY', 'LL'],
  ['BG', 'ALL'],
  ['BY', 'BRR'],
  ['RR', 'AR'],
  ['GY', 'A'],
  ['BB', 'AALLL'],
  ['GR', 'A'],
  ['RY', 'LL'],
  ['GG', 'L'],
  ['GY', 'BB'],
  ['bR', 'ALLL'],
  ['gy', 'AAL'],
];
let gameState1 =
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n    R \n R  YR\nRR  RB';
let gameStateSequence1 = [
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nB     \nR     ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nBB    \nRY    ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n B    \nBB    \nRYG   ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n B    \nBB    \nRYG YB',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n B    \nBB  RR\nRYG YB',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n B  Y \nBB  RR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n      \nB     \nBB  Y \nBB  RR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n      \nB   R \nBB  Y \nBB GRR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBY  R \nBB  Y \nBB GRR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBY  R \nBBG Y \nBBGGRR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBY YR \nBBGGY \nBBGGRR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n      \n R YR \n RGGY \n YGGRR\nRYGGYB',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n    R \n R  YR\nRR  RB',
];
verify(puzzleFighter(test1), [
  gameState1,
  gameStateSequence1.map((e, i) => [test1[i], e]),
]);

let test2 = [
  ['GR', 'ALLL'],
  ['GG', 'ALLL'],
  ['RG', 'AAL'],
  ['RB', 'BLL'],
  ['RG', 'ALL'],
  ['BB', 'RR'],
  ['BR', 'BB'],
  ['BR', 'ALLL'],
  ['YB', 'R'],
  ['BG', 'BBRR'],
  ['YR', 'AAR'],
  ['RR', 'L'],
  ['RR', 'ABLL'],
  ['GY', 'BRR'],
  ['BB', 'R'],
  ['gB', 'RR'],
  ['BR', 'ALL'],
  ['Gr', 'BB'],
  ['Rb', 'R'],
  ['GG', 'B'],
  ['bB', 'LL'],
];
let gameState2 =
  '      \n      \n      \n      \n      \n      \n      \n    R \n  GGY \n  GGYB\nGGGRYB\nGRRBBB';
let gameStateSequence2 = [
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nGR    ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nGG    \nGR    ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nGGG   \nGRR   ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \nBR    \nGGG   \nGRR   ',
  '      \n      \n      \n      \n      \n      \n      \n      \n R    \nBRG   \nGGG   \nGRR   ',
  '      \n      \n      \n      \n      \n      \n      \n      \n R    \nBRG   \nGGG  B\nGRR  B',
  '      \n      \n      \n      \n      \n      \n      \n      \n R    \nBRG   \nGGGR B\nGRRB B',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBR    \nBRG   \nGGGR B\nGRRB B',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBR    \nBRG   \nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBR   G\nBRG  B\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n      \n      \n R    \nBR  RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n      \n      \n RR   \nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n R    \n R    \n RR   \nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n R    \n R    \n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n R  B \n R  B \n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n R  Bg\n R  BB\n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n B    \n R  Bg\n RR BB\n RR YG\nBRR RG\nBRG YB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n     g\n    BB\n    BG\nB   YG\nBBGGYB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n      \n      \n    R \nB   Y \nBBGGYB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n      \n      \n    R \nB GGY \nBBGGYB\nGGGRYB\nGRRBBB',
  '      \n      \n      \n      \n      \n      \n      \n    R \n  GGY \n  GGYB\nGGGRYB\nGRRBBB',
];
verify(puzzleFighter(test2), [
  gameState2,
  gameStateSequence2.map((e, i) => [test2[i], e]),
]);

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

let test4 = [
  ['BB', 'LLLL'],
  ['BB', 'LL'],
  ['BB', 'L'],
  ['BB', 'LLL'],
  ['BB', 'LL'],
  ['BG', 'L'],
  ['BB', ''],
  ['BB', 'R'],
  ['RB', 'BBRRR'],
  ['RR', 'LLL'],
  ['RR', 'BALL'],
  ['RR', ''],
  ['RR', 'R'],
  ['RR', 'L'],
  ['RR', 'B'],
  ['RR', 'LLL'],
  ['RR', 'LL'],
  ['RR', 'BLLL'],
  ['RR', 'B'],
  ['YR', 'ALL'],
  ['GR', 'AL'],
  ['Rb', 'RRRR'],
];
let gameState4 =
  '      \n      \n      \n      \n YG   \nRRR   \nRRR   \nRRRR  \nRRRR  \nRRRR  \n   RRR\n  GRRR';
let gameStateSequence4 = [
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nB     \nB     ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nBB    \nBB    ',
  '      \n      \n      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBB   ',
  '      \n      \n      \n      \n      \n      \n      \n      \nB     \nB     \nBBB   \nBBB   ',
  '      \n      \n      \n      \n      \n      \n      \n      \nBB    \nBB    \nBBB   \nBBB   ',
  '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBB   \nBBB   ',
  '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBBB  \nBBBB  ',
  '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBBBB \nBBBBB ',
  '      \n      \n      \n      \n      \n      \n      \n      \nBBB   \nBBG   \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n      \n      \nR     \nR     \nBBB   \nBBG   \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n      \n      \nRR    \nRR    \nBBB   \nBBG   \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n      \n      \nRR    \nRR    \nBBBR  \nBBGR  \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n      \n      \nRR    \nRR    \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n      \n      \nRRR   \nRRR   \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n      \n  R   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \nR     \nR R   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \nRR    \nRRR   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \nRR    \nRR    \nRRR   \nRRR   \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \nRR    \nRRR   \nRRR   \nRRRR  \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n Y    \nRRR   \nRRR   \nRRR   \nRRRR  \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n YG   \nRRR   \nRRR   \nRRRR  \nRRRR  \nRRRR  \nBBBRR \nBBGRR \nBBBBBB\nBBBBBR',
  '      \n      \n      \n      \n YG   \nRRR   \nRRR   \nRRRR  \nRRRR  \nRRRR  \n   RRR\n  GRRR',
];
verify(puzzleFighter(test4), [
  gameState4,
  gameStateSequence4.map((e, i) => [test4[i], e]),
]);
