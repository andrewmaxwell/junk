class Blobservation {
  constructor(w, h = w) {
    this.h = h;
    this.w = w;
    this.grid = [];
    for (let i = 0; i < w; i++) {
      this.grid[i] = [];
      for (let j = 0; j < h; j++) {
        this.grid[i][j] = 0;
      }
    }
  }
  populate(arr) {
    for (const {x, y, size} of arr) {
      if (
        typeof x === 'number' &&
        typeof y === 'number' &&
        typeof size === 'number' &&
        x >= 0 &&
        x < this.w &&
        y >= 0 &&
        y < this.h &&
        !isNaN(size)
      ) {
        this.grid[x][y] += size;
      } else throw new Error('BAAAAD');
    }
  }
  eachCell(func) {
    for (let i = 0; i < this.w; i++) {
      for (let j = 0; j < this.h; j++) {
        if (this.grid[i][j]) func(i, j, this.grid[i][j]);
      }
    }
  }
  print_state() {
    const result = [];
    this.eachCell((x, y, s) => result.push([x, y, s]));
    return result;
  }
  toString() {
    const result = [];
    for (let j = 0; j < this.h; j++) {
      result[j] = [];
      for (let i = 0; i < this.w; i++) {
        result[j][i] = this.grid[i][j];
      }
    }
    return (
      result
        .map((r) =>
          r.map((v) => (v ? v.toString() : '').padStart(2, '.')).join(' ')
        )
        .join('\n') + '\n\n'
    );
  }
  move(iterations = 1, debug = false) {
    if (typeof iterations !== 'number' || iterations < 1) {
      throw new Error('BAD');
    }

    if (debug) console.log(this.toString());
    for (let i = 0; i < iterations; i++) {
      const newGrid = this.grid.map((c) => c.map(() => 0));
      this.eachCell((x, y) => {
        const target = this.getTarget(x, y);
        // console.log('>>>', x, y, target);
        const nx = target.x > x ? 1 : target.x < x ? -1 : 0;
        const ny = target.y > y ? 1 : target.y < y ? -1 : 0;
        newGrid[x + nx][y + ny] += this.grid[x][y];
      });
      this.grid = newGrid;
      if (debug) console.log(this.toString());
    }
  }
  getTarget(x, y) {
    const blobSize = this.grid[x][y];
    let target;
    this.eachCell((tx, ty, size) => {
      if (size >= blobSize) return;
      const dist = Math.max(Math.abs(tx - x), Math.abs(ty - y));
      const angle = (Math.atan2(ty - y, tx - x) + Math.PI / 2) % (Math.PI * 2);
      if (
        !target ||
        dist < target.dist ||
        (dist === target.dist && size > target.size) ||
        (dist === target.dist && size === target.size && angle > target.angle)
      ) {
        target = {x: tx, y: ty, dist, size, angle};
      }
    });
    return target || {};
  }
}

// https://www.codewars.com/kata/5abab55b20746bc32e000008/train/javascript

import {Test} from './test.js';
// Test.failFast = true;
// const pf = (x, r) => Test.assertDeepEquals(x.print_state(), r);
const pf = (x, r) => {
  const b = new Blobservation(x.w, x.h);
  b.populate(r.map(([x, y, size]) => ({x, y, size})));
  Test.assertDeepEquals(x.toString(), b.toString());
};

let blobs;

const generation0 = [
  {x: 0, y: 4, size: 3},
  {x: 0, y: 7, size: 5},
  {x: 2, y: 0, size: 2},
  {x: 3, y: 7, size: 2},
  {x: 4, y: 3, size: 4},
  {x: 5, y: 6, size: 2},
  {x: 6, y: 7, size: 1},
  {x: 7, y: 0, size: 3},
  {x: 7, y: 2, size: 1},
];
blobs = new Blobservation(8);
blobs.populate(generation0);
blobs.move();
pf(blobs, [
  [0, 6, 5],
  [1, 5, 3],
  [3, 1, 2],
  [4, 7, 2],
  [5, 2, 4],
  [6, 7, 3],
  [7, 1, 3],
  [7, 2, 1],
]);
blobs.move();
pf(blobs, [
  [1, 5, 5],
  [2, 6, 3],
  [4, 2, 2],
  [5, 6, 2],
  [5, 7, 3],
  [6, 1, 4],
  [7, 2, 4],
]);
blobs.move(1000);
pf(blobs, [[4, 3, 23]]);

const generation1 = [
  {x: 3, y: 6, size: 3},
  {x: 8, y: 0, size: 2},
  {x: 5, y: 3, size: 6},
  {x: 1, y: 1, size: 1},
  {x: 2, y: 6, size: 2},
  {x: 1, y: 5, size: 4},
  {x: 7, y: 7, size: 1},
  {x: 9, y: 6, size: 3},
  {x: 8, y: 3, size: 4},
  {x: 5, y: 6, size: 3},
  {x: 0, y: 6, size: 1},
  {x: 3, y: 2, size: 5},
];
const generation2 = [
  {x: 5, y: 4, size: 3},
  {x: 8, y: 6, size: 15},
  {x: 1, y: 4, size: 4},
  {x: 2, y: 7, size: 9},
  {x: 9, y: 0, size: 10},
  {x: 3, y: 5, size: 4},
  {x: 7, y: 2, size: 6},
  {x: 3, y: 3, size: 2},
];
blobs = new Blobservation(10, 8);
blobs.populate(generation1);
blobs.move(1, true);
pf(blobs, [
  [0, 6, 1],
  [1, 1, 1],
  [1, 6, 2],
  [2, 1, 5],
  [2, 6, 7],
  [4, 2, 6],
  [6, 7, 3],
  [7, 1, 2],
  [7, 4, 4],
  [7, 7, 1],
  [8, 7, 3],
]);
blobs.move(2);
pf(blobs, [
  [0, 6, 7],
  [1, 5, 3],
  [2, 2, 6],
  [4, 1, 6],
  [6, 1, 2],
  [6, 4, 4],
  [6, 6, 7],
]);
blobs.move(2);
pf(blobs, [
  [2, 4, 13],
  [3, 3, 3],
  [6, 1, 8],
  [6, 2, 4],
  [6, 4, 7],
]);
blobs.populate(generation2);
pf(blobs, [
  [1, 4, 4],
  [2, 4, 13],
  [2, 7, 9],
  [3, 3, 5],
  [3, 5, 4],
  [5, 4, 3],
  [6, 1, 8],
  [6, 2, 4],
  [6, 4, 7],
  [7, 2, 6],
  [8, 6, 15],
  [9, 0, 10],
]);
blobs.move();
pf(blobs, [
  [2, 4, 9],
  [3, 3, 13],
  [3, 6, 9],
  [4, 4, 4],
  [5, 3, 4],
  [5, 4, 10],
  [6, 2, 6],
  [7, 2, 8],
  [7, 5, 15],
  [8, 1, 10],
]);
blobs.move(3);
pf(blobs, [
  [4, 3, 22],
  [5, 3, 28],
  [5, 4, 9],
  [6, 2, 29],
]);
Test.expectError(
  'Invalid input for the move method should trigger an error',
  () => blobs.move(-3)
);
blobs.move(30);
pf(blobs, [[5, 3, 88]]);
Test.expectError('Invalid elements should trigger an error', () =>
  blobs.populate([
    {x: 4, y: 6, size: 3},
    {x: '3', y: 2, size: true},
  ])
);
