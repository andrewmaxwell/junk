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

const diff = (a, b) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0);

function magicWand(image, origin, threshold) {
  const seen = new Set([image[origin.y][origin.x]]);
  const q = [origin];
  for (const {x, y} of q) {
    for (const [dx, dy] of dirs) {
      const c = image[y + dy]?.[x + dx];
      if (!c || seen.has(c) || diff(c, image[y][x]) > threshold) continue;
      seen.add(c);
      q.push({x: x + dx, y: y + dy});
    }
  }
  return q;
}

import {Test} from './test.js';

const doTest = (image, origin, threshold, expected) => {
  const actual = magicWand(image.slice(), origin, threshold).sort(
    (a, b) => a.x - b.x || a.y - b.y
  );
  Test.assertDeepEquals(
    actual,
    expected,
    `magicWand(${JSON.stringify(image)}, ${JSON.stringify(
      origin
    )}, ${threshold})`
  );
};

const image = [
  [
    [0, 0, 0],
    [5, 5, 5],
    [255, 255, 255],
    [255, 255, 255],
    [70, 50, 30],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [5, 5, 5],
    [255, 255, 255],
    [255, 255, 255],
    [70, 50, 30],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [5, 5, 5],
    [255, 255, 255],
    [255, 255, 255],
    [70, 50, 30],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [5, 5, 5],
    [0, 0, 0],
    [0, 0, 0],
    [70, 50, 30],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [5, 5, 5],
    [0, 15, 5],
    [0, 15, 5],
    [70, 50, 30],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [4, 2, 0],
    [255, 255, 255],
    [255, 255, 255],
    [0, 15, 5],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [4, 2, 0],
    [255, 255, 255],
    [255, 255, 255],
    [0, 15, 5],
    [240, 0, 120],
  ],
  [
    [0, 0, 0],
    [4, 2, 0],
    [255, 255, 255],
    [255, 255, 255],
    [0, 15, 5],
    [240, 0, 120],
  ],
];

const expected = [
  {x: 0, y: 0},
  {x: 0, y: 1},
  {x: 0, y: 2},
  {x: 0, y: 3},
  {x: 0, y: 4},
  {x: 0, y: 5},
  {x: 0, y: 6},
  {x: 0, y: 7},
];

doTest(image, {x: 0, y: 0}, 1, expected);
