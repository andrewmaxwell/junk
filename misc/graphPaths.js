import {median} from 'ramda';

const isValid = (path, next) => {
  const last = path[path.length - 1];
  return path.every(
    (p, i) => p !== next || (path[i - 1] !== last && path[i + 1] !== last)
  );
};

const getLongestLoop = ({nodes, edges}, startIndex) => {
  const neighbors = [];
  for (const [a, b] of edges) {
    const [x1, y1] = nodes[a];
    const [x2, y2] = nodes[b];
    const dist = Math.hypot(x1 - x2, y1 - y2);
    (neighbors[a] = neighbors[a] || []).push({index: b, dist});
    (neighbors[b] = neighbors[b] || []).push({index: a, dist});
  }

  const queue = [{path: [startIndex], len: 0}];
  let result = queue[0];
  while (queue.length) {
    const {path, len} = queue.pop();
    for (const {index, dist} of neighbors[path[path.length - 1]]) {
      if (!isValid(path, index)) continue;
      const next = {path: [...path, index], len: len + dist};
      if (index === startIndex && next.len > result.len) result = next;
      queue.push(next);
    }
  }
  return result;
};

const randEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

const randomWalk = ({edges}, startIndex) => {
  const neighbors = [];
  for (const [a, b] of edges) {
    (neighbors[a] = neighbors[a] || []).push(b);
    (neighbors[b] = neighbors[b] || []).push(a);
  }

  const path = [startIndex];
  for (let i = 0; i < 1e7; i++) {
    let next;
    do {
      next = randEl(neighbors[path[path.length - 1]]);
    } while (next === path[path.length - 2]);

    if (next === startIndex) return path.length;
    path.push(next);
  }
  return -1;
};

const input = {
  nodes: [
    [61, 24],
    [151, 24],
    [267, 20],
    [204, 138],
    [231, 184],
    [165, 82],
    [128, 163],
    [303, 183],
    [282, 91],
    [64, 106],
    [342, 118],
    [344, 56],
    [419, 26],
    [427, 105],
    [275, 240],
    [399, 199],
    [141, 247],
  ],
  edges: [
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 3],
    [6, 5],
    [4, 6],
    [7, 4],
    [8, 7],
    [3, 8],
    [9, 5],
    [10, 8],
    [11, 2],
    [12, 11],
    [10, 11],
    [13, 10],
    [13, 12],
    [7, 13],
    [14, 7],
    [13, 15],
    [14, 15],
    [15, 7],
    [16, 14],
    [9, 16],
    [0, 9],
    [9, 1],
    [5, 1],
    [16, 6],
  ],
};

// const longest = getLongestLoop(input, 0);

// const canvas = document.querySelector('canvas');
// const ctx = canvas.getContext('2d');
// canvas.width = innerWidth;
// canvas.height = innerHeight;

// ctx.strokeStyle = '#AAA';
// ctx.beginPath();
// for (const [a, b] of input.edges) {
//   ctx.moveTo(...input.nodes[a]);
//   ctx.lineTo(...input.nodes[b]);
// }

// for (let i = 0; i < input.nodes.length; i++) {
//   ctx.fillText(i, input.nodes[i][0] + 2, input.nodes[i][1] - 2);
// }
// ctx.stroke();

// ctx.strokeStyle = 'blue';
// ctx.lineWidth = 2;
// ctx.beginPath();
// for (const n of longest.path) {
//   ctx.lineTo(...input.nodes[n]);
// }
// ctx.stroke();

const nums = [];
for (let i = 0; i < 1e6; i++) {
  nums[i] = randomWalk(input, Math.floor(Math.random() * input.nodes.length));
}

// const total = nums.reduce((a, b) => a + b);
// console.log(total / nums.length);
console.log(median(nums));
