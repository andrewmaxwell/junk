import {PuzzleFighter} from './main.js';
import {equals} from 'ramda';

const tests = [
  [`BB\nBB`, [{x: 0, y: 0, w: 2, h: 2, color: 'B'}]],
  [`BBB\nBBB`, [{x: 0, y: 0, w: 3, h: 2, color: 'B'}]],
  [`BBBB\nBBBB`, [{x: 0, y: 0, w: 4, h: 2, color: 'B'}]],
  [
    `GBB\nBBB`,
    [
      {x: 0, y: 0, w: 1, h: 1, color: 'G'},
      {x: 1, y: 0, w: 2, h: 2, color: 'B'},
      {x: 0, y: 1, w: 1, h: 1, color: 'B'},
    ],
  ],
  [
    `GBBB\nBBBG`,
    [
      {x: 0, y: 0, w: 1, h: 1, color: 'G'},
      {x: 1, y: 0, w: 2, h: 2, color: 'B'},
      {x: 3, y: 0, w: 1, h: 1, color: 'B'},
      {x: 0, y: 1, w: 1, h: 1, color: 'B'},
      {x: 3, y: 1, w: 1, h: 1, color: 'G'},
    ],
  ],
  [
    `BBB\nBBB\nBBG`,
    [
      {x: 0, y: 0, w: 3, h: 2, color: 'B'},
      {x: 0, y: 2, w: 1, h: 1, color: 'B'},
      {x: 1, y: 2, w: 1, h: 1, color: 'B'},
      {x: 2, y: 2, w: 1, h: 1, color: 'G'},
    ],
  ],
  [
    `BBG\nBBB\nBBB`,
    [
      {x: 0, y: 0, w: 1, h: 1, color: 'B'},
      {x: 1, y: 0, w: 1, h: 1, color: 'B'},
      {x: 2, y: 0, w: 1, h: 1, color: 'G'},
      {x: 0, y: 1, w: 3, h: 2, color: 'B'},
    ],
  ],
  [
    // `BBG\nBBB\nBBB\nBBB`,
    [
      {x: 0, y: 0, w: 1, h: 1, color: 'B'},
      {x: 1, y: 0, w: 1, h: 1, color: 'B'},
      {x: 2, y: 0, w: 1, h: 1, color: 'G'},
      {x: 0, y: 1, w: 1, h: 1, color: 'B'},
      {x: 1, y: 1, w: 1, h: 1, color: 'B'},
      {x: 2, y: 1, w: 1, h: 1, color: 'B'},
      {x: 0, y: 2, w: 3, h: 2, color: 'B'},
    ],
    [
      {x: 0, y: 0, w: 2, h: 2, color: 'B'},
      {x: 2, y: 0, w: 1, h: 1, color: 'G'},
      {x: 2, y: 1, w: 1, h: 1, color: 'B'},
      {x: 0, y: 2, w: 3, h: 2, color: 'B'},
    ],
  ],
];

tests.forEach(([input, expected]) => {
  const game = new PuzzleFighter();
  game.gems = Array.isArray(input)
    ? input
    : input
        .trim()
        .split('\n')
        .flatMap((r, y) =>
          r.split('').map((color, x) => ({x, y, w: 1, h: 1, color}))
        );
  game.resolvePowerGems();
  if (equals(game.gems, expected)) console.log('PASS');
  else console.log('Expected', expected, 'got', game.gems);
});
