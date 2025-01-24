const plantsAndZombies = (lawn, zombies) => {
  const grid = lawn.map((r) => [...r]);
  const width = grid[0].length;
  let kills = 0;

  const fire = (startX, startY, dy) => {
    for (
      let x = startX + 1, y = startY + dy;
      x < width && y >= 0 && y < grid.length;
      x++, y += dy
    ) {
      if (!grid[y][x].hp) continue;
      grid[y][x].hp--;
      if (grid[y][x].hp === 0) {
        grid[y][x] = ' ';
        kills++;
      }
      break;
    }
  };

  for (let moves = 0; kills < zombies.length; moves++) {
    // console.log('\n\nMove ' + moves);
    // console.log(
    //   grid
    //     .map((r) => r.map((c) => (c.hp ? 'z' : c)).join(''))
    //     .join('\n')
    //     .replace(/ /g, '.')
    // );

    // zombies move
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < width; x++) {
        if (!grid[y][x].hp) continue;
        if (x === 0) return moves; // zombies win
        grid[y][x - 1] = grid[y][x];
        grid[y][x] = ' ';
      }
    }

    // new zombies appear
    for (const [i, row, hp] of zombies) {
      if (i === moves) grid[row][width - 1] = {hp};
    }

    // numbered shooters fire
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < width; x++) {
        for (let k = 0; k < grid[y][x]; k++) {
          fire(x, y, 0);
        }
      }
    }

    // S shooters fire: right to left, top to bottom
    for (let y = 0; y < grid.length; y++) {
      for (let x = width - 1; x >= 0; x--) {
        if (grid[y][x] !== 'S') continue;
        fire(x, y, -1);
        fire(x, y, 0);
        fire(x, y, 1);
      }
    }
  }
  return null;
};

import {Test} from './test.js';
const exampleTests = [
  [
    ['2       ', '  S     ', '21  S   ', '13      ', '2 3     '],
    [
      [0, 4, 28],
      [1, 1, 6],
      [2, 0, 10],
      [2, 4, 15],
      [3, 2, 16],
      [3, 3, 13],
    ],
  ],
  [
    ['11      ', ' 2S     ', '11S     ', '3       ', '13      '],
    [
      [0, 3, 16],
      [2, 2, 15],
      [2, 1, 16],
      [4, 4, 30],
      [4, 2, 12],
      [5, 0, 14],
      [7, 3, 16],
      [7, 0, 13],
    ],
  ],
  [
    [
      '12        ',
      '3S        ',
      '2S        ',
      '1S        ',
      '2         ',
      '3         ',
    ],
    [
      [0, 0, 18],
      [2, 3, 12],
      [2, 5, 25],
      [4, 2, 21],
      [6, 1, 35],
      [6, 4, 9],
      [8, 0, 22],
      [8, 1, 8],
      [8, 2, 17],
      [10, 3, 18],
      [11, 0, 15],
      [12, 4, 21],
    ],
  ],
  [
    ['12      ', '2S      ', '1S      ', '2S      ', '3       '],
    [
      [0, 0, 15],
      [1, 1, 18],
      [2, 2, 14],
      [3, 3, 15],
      [4, 4, 13],
      [5, 0, 12],
      [6, 1, 19],
      [7, 2, 11],
      [8, 3, 17],
      [9, 4, 18],
      [10, 0, 15],
      [11, 4, 14],
    ],
  ],
  [
    [
      '1         ',
      'SS        ',
      'SSS       ',
      'SSS       ',
      'SS        ',
      '1         ',
    ],
    [
      [0, 2, 16],
      [1, 3, 19],
      [2, 0, 18],
      [4, 2, 21],
      [6, 3, 20],
      [7, 5, 17],
      [8, 1, 21],
      [8, 2, 11],
      [9, 0, 10],
      [11, 4, 23],
      [12, 1, 15],
      [13, 3, 22],
    ],
  ],
];
const exampleSolutions = [10, 12, 20, 19, null];
exampleTests.forEach((e, i) =>
  Test.assertEquals(plantsAndZombies(...e), exampleSolutions[i])
);
