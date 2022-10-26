let open;
// https://www.codewars.com/kata/57ff9d3b8f7dda23130015fa/train/javascript

const dirs = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const solveMine = (map, n) => {
  console.log(map);
  map = map.split('\n').map((r) => r.split(' '));

  for (let i = 0; i < map.length; i++) {
    for (let j = 0; j < map[i].length; j++) {
      if (map[i][j] !== '0') continue;
      for (const [dx, dy] of dirs) {
        const nx = j + dx;
        const ny = i + dy;
        if (map[ny] && map[ny][nx] === '?') {
          map[ny][nx] = open(ny, nx);
        }
      }
    }
  }

  return map.map((r) => r.join(' ')).join('\n');
};

import {Test} from './test.js';
let map, result;

const game = {
  read: (map) => {
    map = map.split('\n').map((r) => r.split(' '));
    open = (row, col) => {
      const val = map[row][col];
      if (val === 'x') throw new Error('you dead');
      return val;
    };
  },
};

map = `? ? ? ? ? ?
? ? ? ? ? ?
? ? ? 0 ? ?
? ? ? ? ? ?
? ? ? ? ? ?
0 0 0 ? ? ?`;
result = `1 x 1 1 x 1
2 2 2 1 2 2
2 x 2 0 1 x
2 x 2 1 2 2
1 1 1 1 x 1
0 0 0 1 1 1`;

game.read(result);
Test.assertSimilar(solveMine(map, 6), result);

// map = `0 ? ?
// 0 ? ?`;
// result = `0 1 x
// 0 1 1`;
// game.read(result);
// Test.assertSimilar(solveMine(map, 1), '?');

// map = `0 ? ?
// 0 ? ?`;
// result = `0 2 x
// 0 2 x`;
// game.read(result);
// Test.assertSimilar(solveMine(map, 2), result);

// map = `? ? ? ? 0 0 0
// ? ? ? ? 0 ? ?
// ? ? ? 0 0 ? ?
// ? ? ? 0 0 ? ?
// 0 ? ? ? 0 0 0
// 0 ? ? ? 0 0 0
// 0 ? ? ? 0 ? ?
// 0 0 0 0 0 ? ?
// 0 0 0 0 0 ? ?`;
// result = `1 x x 1 0 0 0
// 2 3 3 1 0 1 1
// 1 x 1 0 0 1 x
// 1 1 1 0 0 1 1
// 0 1 1 1 0 0 0
// 0 1 x 1 0 0 0
// 0 1 1 1 0 1 1
// 0 0 0 0 0 1 x
// 0 0 0 0 0 1 1`;
// game.read(result);
// Test.assertSimilar(solveMine(map, 6), result);
