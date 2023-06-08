import {makeMaze} from '../maze2/makeMaze.js';
import {color, makeGradient, makeRenderer} from '../sand/makeRenderer.js';

const canvas = document.querySelector('canvas');

const scale = 8;
const mazeScale = 4;
const rows = Math.floor(innerHeight / scale);
const cols = Math.floor(innerWidth / scale);

const speed = 0.25;

let grid, pairs, entrance, exit;
// let mouse = {x: 0, y: 0};

const black = color(0, 0, 0);
const colors = makeGradient([
  [0, 0, 255],
  [100, 100, 100],
  [255, 255, 0],
]);
const render = makeRenderer(canvas, cols, rows, ({wall, pr}) =>
  wall ? black : colors(Math.min(1, Math.max(0, pr + 0.5)))
);

const reset = () => {
  const maze = makeMaze(
    Math.ceil(rows / mazeScale),
    Math.ceil(cols / mazeScale)
  );

  grid = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      grid[y * cols + x] = maze[Math.floor(y / mazeScale)][
        Math.floor(x / mazeScale)
      ]
        ? {pr: 0, p2: 0}
        : {wall: true};
    }
  }

  entrance = grid.find((x) => !x.wall);
  exit = grid.findLast((x) => !x.wall);

  pairs = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y * cols + x].wall) continue;
      if (x < cols - 1 && !grid[y * cols + x + 1].wall) {
        pairs.push([grid[y * cols + x], grid[y * cols + x + 1]]);
      }
      if (y < rows - 1 && !grid[(y + 1) * cols + x].wall) {
        pairs.push([grid[y * cols + x], grid[(y + 1) * cols + x]]);
      }
    }
  }
};

const loop = () => {
  for (let i = 0; i < 100; i++) {
    entrance.p2 += 1;
    exit.p2 -= 1;

    for (const [a, b] of pairs) {
      const amt = (a.pr - b.pr) * speed;
      a.p2 -= amt;
      b.p2 += amt;
    }
    for (const g of grid) g.pr = g.p2;
  }
  render(grid);
  requestAnimationFrame(loop);
};

reset();
loop();

// canvas.addEventListener('mousemove', (e) => {
//   mouse = {x: e.offsetX, y: e.offsetY};
//   console.log(
//     grid[Math.floor(mouse.y / scale) * cols + Math.floor(mouse.x / scale)]
//   );
// });
