/*
0 - w, gv
10 - r, wg
20 - b, wr
30 - y, wb
40 - v, wy
50 - g, wv
60 - t, rg
70 - p, rt
80 - l, bp
90 - o, yg
100 - c, po
110 - g, tc
*/

import {PriorityQueue} from './PriorityQueue.js';
import {Trie} from './Trie.js';

const rotationData = {
  w: [
    [0, 2, 4, 6, 8],
    [1, 3, 5, 7, 9],
    [50, 40, 30, 20, 10],
    [51, 41, 31, 21, 11],
    [52, 42, 32, 22, 12],
  ],
  r: [
    [10, 12, 14, 16, 18],
    [11, 13, 15, 17, 19],
    [8, 20, 72, 62, 54],
    [7, 29, 71, 61, 53],
    [6, 28, 70, 60, 52],
  ],
  b: [
    [20, 22, 24, 26, 28],
    [21, 23, 25, 27, 29],
    [6, 30, 82, 74, 14],
    [5, 39, 81, 73, 13],
    [4, 38, 80, 72, 12],
  ],
  y: [
    [30, 32, 34, 36, 38],
    [31, 33, 35, 37, 39],
    [4, 40, 92, 84, 24],
    [3, 49, 91, 83, 23],
    [2, 48, 90, 82, 22],
  ],
  v: [
    [40, 42, 44, 46, 48],
    [41, 43, 45, 47, 49],
    [2, 50, 102, 94, 34],
    [1, 59, 101, 93, 33],
    [0, 58, 100, 92, 32],
  ],
  g: [
    [50, 52, 54, 56, 58],
    [51, 53, 55, 57, 59],
    [0, 10, 60, 104, 44],
    [9, 19, 69, 103, 43],
    [8, 18, 68, 102, 42],
  ],
  t: [
    [60, 62, 64, 66, 68],
    [61, 63, 65, 67, 69],
    [18, 70, 112, 106, 56],
    [17, 79, 111, 105, 55],
    [16, 78, 110, 104, 54],
  ],
  p: [
    [70, 72, 74, 76, 78],
    [71, 73, 75, 77, 79],
    [16, 28, 80, 112, 64],
    [15, 27, 89, 113, 63],
    [14, 26, 88, 112, 62],
  ],
  l: [
    [80, 82, 84, 86, 88],
    [81, 83, 85, 87, 89],
    [26, 38, 90, 116, 76],
    [25, 37, 99, 115, 75],
    [24, 36, 98, 114, 74],
  ],
  o: [
    [90, 92, 94, 96, 98],
    [91, 93, 95, 97, 99],
    [36, 48, 100, 118, 86],
    [35, 47, 109, 117, 85],
    [34, 46, 108, 116, 84],
  ],
  c: [
    [100, 102, 104, 106, 108],
    [101, 103, 105, 107, 109],
    [46, 58, 68, 110, 96],
    [45, 57, 67, 119, 95],
    [44, 66, 66, 118, 94],
  ],
  a: [
    [110, 112, 114, 116, 118],
    [111, 113, 115, 117, 119],
    [66, 78, 88, 98, 108],
    [54, 75, 87, 97, 107],
    [64, 76, 86, 96, 106],
  ],
};

const goal = Object.keys(rotationData).flatMap((c) => [...c.repeat(10)]);
const len = goal.length;

const rotations = Object.keys(rotationData).flatMap((color) => {
  const left = [...new Array(len).keys()];
  const right = [...new Array(len).keys()];
  for (const arr of rotationData[color]) {
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      const b = arr[(i + 1) % arr.length];
      right[b] = a;
      left[a] = b;
    }
  }
  return [
    {move: color + 'R', order: right},
    {move: color + 'L', order: left},
  ];
});

const rotate = (arr, order) => {
  const result = new Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = arr[order[i]];
  }
  return result;
};

const start = `
tgyyptwvaw
coygppotwt
vpaoolwbac
lowryagaac
bwgygbpalg
cbtcgbvvrw
raabplowoy
crtrrllvbl
bolcvvgpyy
cpborwrtvg
tptyyvcrbr
valcolwgpt`
  .replace(/[^a-z]/g, '')
  .split('');

const getDiff = (arr) => arr.reduce((diff, t, i) => diff + (t !== goal[i]), 0);

const go = () => {
  const seen = new Trie();
  const q = new PriorityQueue((a, b) => a.diff < b.diff);

  q.push({arr: start, diff: getDiff(start), moves: []});

  for (let i = 0; i < 1e5 && q.size(); i++) {
    const curr = q.pop();
    for (const {move, order} of rotations) {
      const next = rotate(curr.arr, order);
      const nextScore = getDiff(next);
      if (!nextScore) return curr.moves + move;
      const str = next.join('');
      if (seen.has(str)) continue;
      seen.add(str);
      q.push({arr: next, diff: nextScore, moves: curr.moves + move});
    }
  }

  console.log(q.heap.pop(), q.size());
};

// import {Test} from './test.js';
// Test.assertDeepEquals(getDiff(start), 111);
// Test.assertDeepEquals(getDiff(goal), 0);

console.time();
const result = go();
console.timeEnd();
console.log(result);

// console.log(rotations);
