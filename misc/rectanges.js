// function calculate(rects) {
//   if (!rects.length) return 0;

//   rects.sort((a, b) => a[0] - b[0]);

//   const yCoords = [...new Set(rects.flatMap(([, y0, , y1]) => [y0, y1]))].sort(
//     (a, b) => a - b
//   );

//   const pos = [];
//   const heights = [];
//   for (let i = 0; i < yCoords.length - 1; i++) {
//     pos[yCoords[i]] = 0;
//     heights[yCoords[i]] = yCoords[i + 1] - yCoords[i];
//   }

//   let result = 0;
//   for (const [x0, y0, x1, y1] of rects) {
//     for (let i = y0; i < y1; i += heights[i]) {
//       if (pos[i] > x1) continue;
//       result += heights[i] * (x1 - Math.max(pos[i], x0));
//       pos[i] = x1;
//     }
//   }
//   return result;
// }

class Tree {
  constructor(start, end) {
    this.start = start;
    this.middle = Math.floor((end + start) / 2);
    this.end = end;
    this.val = 0;
  }
  addVal(left, right, val) {
    if (this.start === left && this.end === right) this.val += val;
    else {
      if (left < this.middle && left < right) {
        if (!this.left) this.left = new Tree(this.start, this.middle);
        this.left.addVal(left, Math.min(this.middle, right), val);
      }
      if (right > this.middle && right > left) {
        if (!this.right) this.right = new Tree(this.middle, this.end);
        this.right.addVal(Math.max(this.middle, left), right, val);
      }
    }
    this.total =
      this.val > 0
        ? this.end - this.start
        : (this.left ? this.left.total : 0) +
          (this.right ? this.right.total : 0);
  }
}

const calculate = (recs) => {
  const obs = [];
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [left, top, right, bottom] of recs) {
    obs.push({y: top, left, right, val: 1}, {y: bottom, left, right, val: -1});
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
  }
  obs.sort((a, b) => a.y - b.y);

  const tree = new Tree(minX, maxX);
  let result = 0;
  for (let i = 0; i < obs.length - 1; i++) {
    const {y, val, left, right} = obs[i];
    tree.addVal(left, right, val);
    result += tree.total * (obs[i + 1].y - y);
  }
  return result;
};

import {Test} from './test.js';
Test.assertEquals(calculate([]), 0, 'calculate([]) should return 0');
Test.assertEquals(
  calculate([[0, 0, 1, 1]]),
  1,
  'calculate([[0,0,1,1]]) should return 1'
);
Test.assertEquals(
  calculate([[0, 4, 11, 6]]),
  22,
  'calculate([[0, 4, 11, 6]]]) should return 22'
);

Test.assertEquals(
  calculate([
    [0, 0, 1, 1],
    [1, 1, 2, 2],
  ]),
  2,
  'calculate([[0,0,1,1], [1,1,2,2]]) should return 2'
);

Test.assertEquals(
  calculate([
    [0, 0, 1, 1],
    [0, 0, 2, 2],
  ]),
  4,
  'calculate([[0,0,1,1], [0,0,2,2]]) should return 4'
);
Test.assertEquals(
  calculate([
    [3, 3, 8, 5],
    [6, 3, 8, 9],
    [11, 6, 14, 12],
  ]),
  36,
  'calculate([[3,3,8,5], [6,3,8,9],[11,6,14,12]]) should return 36'
);

Test.assertEquals(
  calculate([
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
  ]),
  1
);

Test.assertEquals(
  calculate([
    [0, 0, 2, 2],
    [0, 0, 2, 1],
    [0, 0, 1, 2],
    [0, 0, 1, 1],
  ]),
  4
);

Test.assertEquals(
  calculate([
    [1, 1, 2, 2],
    [1, 4, 2, 7],
    [1, 4, 2, 6],
    [1, 4, 4, 5],
    [2, 5, 6, 7],
    [4, 3, 7, 6],
  ]),
  21
);
