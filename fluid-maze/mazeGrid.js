import {shuffle} from '../carcassonne/utils.js';

const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

const makeMaze = ({mazeRows, mazeCols}) => {
  const maze = Array.from({length: mazeRows}, (_, y) =>
    Array.from({length: mazeCols}, (_, x) => ({x, y}))
  );
  const q = [maze[Math.floor(mazeRows / 2)][Math.floor(mazeCols / 2)]];

  while (q.length) {
    const curr = q.pop();
    if (curr.visited) continue;

    curr.visited = true;

    for (const [dx, dy] of shuffle(dirs)) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      if (!maze[ny]?.[nx] || maze[ny][nx].visited) continue;
      q.push(maze[ny][nx]);
      maze[ny][nx].prev = curr;
    }
  }

  return maze.flatMap((row) =>
    row
      .filter((c) => c.prev)
      .map(({x, y, prev}) => ({
        x1: Math.min(x, prev.x),
        y1: Math.min(y, prev.y),
        horizontal: y === prev.y,
      }))
  );
};

const mazeToGrid = ({maze, mazeRows, mazeCols}) => {
  const grid = [];
  for (let y = 0; y <= mazeRows * 2; y++) {
    grid[y] = [];
    for (let x = 0; x <= mazeCols * 2; x++) {
      grid[y][x] = !(y % 2 && x % 2);
    }
  }

  for (const {x1, y1, horizontal} of maze) {
    const row = horizontal ? 1 + y1 * 2 : y1 * 2 + 2;
    const col = horizontal ? x1 * 2 + 2 : 1 + x1 * 2;
    grid[row][col] = false;
  }

  return grid;
};

const gridToRects = (grid) => {
  const rects = [];

  // horizontal
  for (let y = 0; y < grid.length; y++) {
    let startX = null;
    for (let x = 0; x <= grid[y].length; x++) {
      if (grid[y][x] && startX === null) startX = x;
      if (!grid[y][x] && startX !== null) {
        if (x - startX > 1) rects.push({x: startX, y, w: x - startX, h: 1});
        startX = null;
      }
    }
  }

  // vertical
  for (let x = 0; x < grid[0].length; x++) {
    let startY = null;
    for (let y = 0; y <= grid.length; y++) {
      if (grid[y]?.[x] && startY === null) startY = y;
      if (!grid[y]?.[x] && startY !== null) {
        if (y - startY > 1) rects.push({x, y: startY, w: 1, h: y - startY});
        startY = null;
      }
    }
  }

  return rects;
};

export const makeMazeGrid = ({
  mazeRows,
  mazeCols,
  scale,
  wallThickness,
  shiftDown,
}) => {
  const grid = mazeToGrid({
    maze: makeMaze({mazeRows, mazeCols}),
    mazeRows,
    mazeCols,
  });

  grid[0][1] = false; // entrance
  grid[grid.length - 2][grid[0].length - 1] = false; // exit

  return gridToRects(grid).map((r) => {
    r.x = r.x * scale;
    r.y = r.y * scale + shiftDown;
    if (r.w === 1) {
      r.h = (r.h - 1) * scale + wallThickness;
      r.w *= wallThickness;
    } else {
      r.w = (r.w - 1) * scale + wallThickness;
      r.h *= wallThickness;
    }

    // left and right walls
    if ((r.x === 0 || r.x === scale * (grid[0].length - 1)) && r.w === 1) {
      r.y -= shiftDown;
      r.h += shiftDown;
    }
    return r;
  });
};
