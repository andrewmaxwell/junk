type Coord = {x: number; y: number};
type Input = {
  width: number;
  height: number;
  targets: Array<Coord>;
  vWalls?: Array<Coord>;
  hWalls?: Array<Coord>;
};

const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

function isValid(
  {width, height, targets, vWalls, hWalls}: Input,
  solution: Coord[],
  {x: dx, y: dy}: Coord,
) {
  const last = solution[solution.length - 1];
  const nx = last.x + dx;
  const ny = last.y + dy;

  const isOnGrid = nx >= 0 && nx < width && ny >= 0 && ny < height;
  if (!isOnGrid) return false;

  const isAlreadyInSolution = solution.some((s) => s.x === nx && s.y === ny);
  if (isAlreadyInSolution) return false;

  const crossesVWall =
    dx && vWalls?.some((w) => w.y === ny && w.x === nx + (1 - dx) / 2);
  if (crossesVWall) return false;

  const crossesHWall =
    dy && hWalls?.some((w) => w.x === nx && w.y === ny + (1 - dy) / 2);
  if (crossesHWall) return false;

  const numIndex = targets.findIndex((n) => n.x === nx && n.y === ny);
  const cellHasNumber = numIndex > -1;

  if (!cellHasNumber) return true;

  // if last number but some cells are empty, invalid
  const hasEmptyCells =
    numIndex === targets.length - 1 && solution.length < width * height - 1;
  if (hasEmptyCells) return false;

  // if previous number is unexpected, invalid
  const prev = targets[numIndex - 1];
  for (let i = solution.length - 1; i >= 0; i--) {
    const s = solution[i];
    const isExpectedNumber = s.x === prev.x && s.y === prev.y;
    if (isExpectedNumber) break;

    const isUnexpectedNumber = targets.some((n) => n.x === s.x && n.y === s.y);
    if (isUnexpectedNumber) return false;
  }

  return true;
}

function solve(
  puzzle: Input,
  solution: Coord[] = [puzzle.targets[0]],
): Coord[] | null {
  if (solution.length === puzzle.width * puzzle.height) return solution;
  for (const d of dirs) {
    if (!isValid(puzzle, solution, d)) continue;
    const last = solution[solution.length - 1];
    solution.push({x: last.x + d.x, y: last.y + d.y});
    const s = solve(puzzle, solution);
    if (s) return s;
    solution.pop();
  }
  return null;
}

import assert from 'node:assert/strict';

// 1) 1x2 (only one possible path)
assert.deepStrictEqual(
  solve({
    width: 1,
    height: 2,
    targets: [
      {x: 0, y: 0}, // 1
      {x: 0, y: 1}, // 2
    ],
  }),
  [
    {x: 0, y: 0}, // 1
    {x: 0, y: 1}, // 2
  ],
);

// 2) 2x1 (only one possible path)
assert.deepStrictEqual(
  solve({
    width: 2,
    height: 1,
    targets: [
      {x: 0, y: 0}, // 1
      {x: 1, y: 0}, // 2
    ],
  }),
  [
    {x: 0, y: 0}, // 1
    {x: 1, y: 0}, // 2
  ],
);

// 3) 3x1 (only one possible path)
assert.deepStrictEqual(
  solve({
    width: 3,
    height: 1,
    targets: [
      {x: 0, y: 0}, // 1
      {x: 2, y: 0}, // 2
    ],
  }),
  [
    {x: 0, y: 0}, // 1
    {x: 1, y: 0},
    {x: 2, y: 0}, // 2
  ],
);

// 4) 2x3 (unique solution with these endpoints)
assert.deepStrictEqual(
  solve({
    width: 2,
    height: 3,
    targets: [
      {x: 0, y: 0}, // 1
      {x: 1, y: 2}, // 2
    ],
  }),
  [
    {x: 0, y: 0}, // 1
    {x: 1, y: 0},
    {x: 1, y: 1},
    {x: 0, y: 1},
    {x: 0, y: 2},
    {x: 1, y: 2}, // 2
  ],
);

// 5) 3x2 (unique solution with these endpoints)
assert.deepStrictEqual(
  solve({
    width: 3,
    height: 2,
    targets: [
      {x: 0, y: 0}, // 1
      {x: 2, y: 1}, // 2
    ],
  }),
  [
    {x: 0, y: 0}, // 1
    {x: 0, y: 1},
    {x: 1, y: 1},
    {x: 1, y: 0},
    {x: 2, y: 0},
    {x: 2, y: 1}, // 2
  ],
);

// 6) 2x2 UNSOLVABLE (forces null)
assert.deepStrictEqual(
  solve({
    width: 2,
    height: 2,
    targets: [
      {x: 0, y: 0}, // 1
      {x: 1, y: 1}, // 2
    ],
  }),
  null,
);

// 7) 4x4 (your original medium example)
assert.deepStrictEqual(
  solve({
    width: 4,
    height: 4,
    targets: [
      {x: 1, y: 1}, // 1
      {x: 1, y: 2}, // 2
      {x: 2, y: 0}, // 3
      {x: 0, y: 3}, // 4
    ],
    vWalls: [{x: 2, y: 0}],
  }),
  [
    {x: 1, y: 1}, // 1
    {x: 1, y: 0},
    {x: 0, y: 0},
    {x: 0, y: 1},
    {x: 0, y: 2},
    {x: 1, y: 2}, // 2
    {x: 2, y: 2},
    {x: 2, y: 1},
    {x: 2, y: 0}, // 3
    {x: 3, y: 0},
    {x: 3, y: 1},
    {x: 3, y: 2},
    {x: 3, y: 3},
    {x: 2, y: 3},
    {x: 1, y: 3},
    {x: 0, y: 3}, // 4
  ],
);

// 8) 7x7 (your big example)
assert.deepStrictEqual(
  solve({
    width: 7,
    height: 7,
    targets: [
      {x: 3, y: 3}, // 1
      {x: 1, y: 5}, // 2
      {x: 1, y: 1}, // 3
      {x: 0, y: 6}, // 4
      {x: 5, y: 1}, // 5
      {x: 5, y: 5}, // 6
      {x: 6, y: 6}, // 7
      {x: 6, y: 0}, // 8
      {x: 0, y: 0}, // 9
    ],
    vWalls: [
      {x: 3, y: 1},
      {x: 4, y: 1},
      {x: 1, y: 3},
      {x: 2, y: 3},
      {x: 5, y: 3},
      {x: 6, y: 3},
      {x: 3, y: 5},
      {x: 4, y: 5},
    ],
  }),
  [
    {x: 3, y: 3}, // 1
    {x: 2, y: 3},
    {x: 2, y: 4},
    {x: 2, y: 5},
    {x: 1, y: 5}, // 2
    {x: 1, y: 4},
    {x: 1, y: 3},
    {x: 1, y: 2},
    {x: 1, y: 1}, // 3
    {x: 0, y: 1},
    {x: 0, y: 2},
    {x: 0, y: 3},
    {x: 0, y: 4},
    {x: 0, y: 5},
    {x: 0, y: 6}, // 4
    {x: 1, y: 6},
    {x: 2, y: 6},
    {x: 3, y: 6},
    {x: 3, y: 5},
    {x: 3, y: 4},
    {x: 4, y: 4},
    {x: 4, y: 3},
    {x: 4, y: 2},
    {x: 4, y: 1},
    {x: 5, y: 1}, // 5
    {x: 5, y: 2},
    {x: 5, y: 3},
    {x: 5, y: 4},
    {x: 5, y: 5}, // 6
    {x: 4, y: 5},
    {x: 4, y: 6},
    {x: 5, y: 6},
    {x: 6, y: 6}, // 7
    {x: 6, y: 5},
    {x: 6, y: 4},
    {x: 6, y: 3},
    {x: 6, y: 2},
    {x: 6, y: 1},
    {x: 6, y: 0}, // 8
    {x: 5, y: 0},
    {x: 4, y: 0},
    {x: 3, y: 0},
    {x: 3, y: 1},
    {x: 3, y: 2},
    {x: 2, y: 2},
    {x: 2, y: 1},
    {x: 2, y: 0},
    {x: 1, y: 0},
    {x: 0, y: 0}, // 9
  ],
);

console.log('All tests passed.');
