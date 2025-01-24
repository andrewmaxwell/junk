class PriorityQueue {
  constructor(compare) {
    this.heap = [];
    this.compare = compare;
  }
  isEmpty() {
    return !this.heap.length;
  }
  push(val) {
    const {heap, compare} = this;
    heap.push(val);

    // sift up
    for (let i = heap.length - 1, parent; i; i = parent) {
      parent = Math.floor((i - 1) / 2);
      if (!compare(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
    }
  }
  pop() {
    const {heap, compare} = this;
    const min = heap[0];
    const last = heap.pop();

    if (heap.length > 0) {
      heap[0] = last;

      // sift down
      for (let i = 0, smallest; true; i = smallest) {
        smallest = i;
        if (compare(heap[2 * i + 1], heap[smallest])) smallest = 2 * i + 1;
        if (compare(heap[2 * i + 2], heap[smallest])) smallest = 2 * i + 2;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      }
    }

    return min;
  }
}

const directions = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const volume = (board) => {
  const rows = board.length;
  const cols = board[0].length;
  const heap = new PriorityQueue((a, b) => a?.height < b?.height); // lower heights take priority
  const visited = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (y && x && y !== rows - 1 && x !== cols - 1) continue;
      heap.push({height: board[y][x], x, y});
      visited[y * cols + x] = true;
    }
  }

  let total = 0;

  while (!heap.isEmpty()) {
    const {height, x, y} = heap.pop();

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (
        nx < 0 ||
        nx >= cols ||
        ny < 0 ||
        ny >= rows ||
        visited[ny * cols + nx]
      )
        continue;

      visited[ny * cols + nx] = true;
      total += Math.max(0, height - board[ny][nx]);
      heap.push({height: Math.max(board[ny][nx], height), x: nx, y: ny});
    }
  }

  return total;
};

import {Test} from './test.js';
Test.failFast = true;

const test = (heightmap, expected) =>
  Test.assertDeepEquals(volume(heightmap), expected);

test([[0]], 0);
test([[22]], 0);
test(
  [
    [2, 1, 2],
    [1, 0, 1],
    [2, 1, 2],
  ],
  1
);
test(
  [
    [1, 1, 1],
    [1, 8, 1],
    [1, 1, 1],
  ],
  0
);
test(
  [
    [9, 9, 9, 9],
    [9, 0, 0, 9],
    [9, 0, 0, 9],
    [9, 9, 9, 9],
  ],
  36
);
test(
  [
    [9, 9, 9, 9, 9],
    [9, 0, 1, 2, 9],
    [9, 7, 8, 3, 9],
    [9, 6, 5, 4, 9],
    [9, 9, 9, 9, 9],
  ],
  45
);
test(
  [
    [8, 8, 8, 8, 6, 6, 6, 6],
    [8, 0, 0, 8, 6, 0, 0, 6],
    [8, 0, 0, 8, 6, 0, 0, 6],
    [8, 8, 8, 8, 6, 6, 6, 0],
  ],
  56
);
test(
  [
    [0, 10, 0, 20, 0],
    [20, 0, 30, 0, 40],
    [0, 40, 0, 50, 0],
    [50, 0, 60, 0, 70],
    [0, 60, 0, 70, 0],
  ],
  150
);
test(
  [
    [3, 3, 3, 3, 3],
    [3, 0, 0, 0, 3],
    [3, 3, 3, 0, 3],
    [3, 0, 0, 0, 3],
    [3, 0, 3, 3, 3],
    [3, 0, 0, 0, 3],
    [3, 3, 3, 0, 3],
  ],
  0
);
test(
  [
    [3, 3, 3, 3, 3],
    [3, 2, 2, 2, 3],
    [3, 3, 3, 2, 3],
    [3, 1, 1, 1, 3],
    [3, 1, 3, 3, 3],
    [3, 0, 0, 0, 3],
    [3, 3, 3, 0, 3],
  ],
  0
);
const f = () => [
  [3, 3, 3, 3, 3],
  [3, 0, 0, 0, 3],
  [3, 3, 3, 0, 3],
  [3, 0, 0, 0, 3],
  [3, 0, 3, 3, 3],
  [3, 0, 0, 0, 3],
  [3, 3, 3, 1, 3],
];
test(f(), 11);
test(f().reverse(), 11);
test(
  f().map((r) => r.reverse()),
  11
);
test(
  f()
    .reverse()
    .map((r) => r.reverse()),
  11
);

test([[-1]], 0);
test(
  [
    [3, 3, 3, 3, 3],
    [3, 0, 0, 0, 3],
    [3, 3, 3, 0, 3],
    [3, 0, -2, 0, 3],
    [3, 0, 3, 3, 3],
    [3, 0, 0, 0, 3],
    [3, 3, 3, 1, -3],
  ],
  13
);
test(
  [
    [8192, 8192, 8192, 8192],
    [8192, -8192, -8192, 8192],
    [8192, -8192, -8192, 8192],
    [8192, 8192, 8192, 8192],
  ],
  65536
);

// A 50x50 heightmap with 100 around the edge and 0 in the middle.
let hmap = Array(50).fill(0);
hmap = hmap.map(() => hmap.slice());
hmap[0] = hmap[0].map(() => 100);
hmap[49] = hmap[49].map(() => 100);
for (let i = 1; i < 49; i++) hmap[i][0] = hmap[i][49] = 100;
test(hmap, 100 * 48 * 48);
