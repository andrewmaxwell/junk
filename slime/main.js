import {makeGradient, makeRenderer} from '../sand/makeRenderer.js';

const width = innerWidth / 2;
const height = innerHeight / 2;
const numCells = 10000;
const sensingDistance = 4;
const sensingRadius = 4;
const sensingAngle = Math.PI / 4;
const turnSpeed = 0.1;
const pheromoneStrength = 0.1;
const fadeSpeed = 0.995;

const render = makeRenderer(
  document.querySelector('canvas'),
  width,
  height,
  makeGradient([
    [0, 0, 0], // black
    [0, 0, 255], // blue
    [0, 255, 255], // cyan
    [0, 255, 0], // green
    [255, 255, 0], // yellow
    [255, 0, 0], // red
    [255, 0, 255], // magenta
    [255, 255, 255], // white
  ])
);

let cells, grid, grid2;

const reset = () => {
  cells = Array.from({length: numCells}, () => {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const angle = 2 * Math.PI * Math.random();
    return {x, y, angle};
  });
  grid = Array.from({length: width * height}).fill(0);
  grid2 = Array.from({length: width * height}).fill(0);
};

const getStrength = (x, y) => grid[y * width + x];

const dissipate = () => {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      grid2[y * width + x] =
        ((getStrength(x, y) +
          getStrength((x + 1) % width, y) +
          getStrength(x, (y + 1) % height) +
          getStrength((x - 1 + width) % width, y) +
          getStrength(x, (y - 1 + height) % height)) /
          5) *
        fadeSpeed;
    }
  }
  [grid, grid2] = [grid2, grid];
};

// precalculate
const sensingCoords = [];
for (let y = -sensingRadius; y <= sensingRadius; y++) {
  for (let x = -sensingRadius; x <= +sensingRadius; x++) {
    if (y ** 2 + x ** 2 > sensingRadius ** 2) continue;
    sensingCoords.push({x, y});
  }
}
const sense = (x, y, angle) => {
  const cx = Math.round(x + sensingDistance * Math.cos(angle));
  const cy = Math.round(y + sensingDistance * Math.sin(angle));
  return sensingCoords.reduce(
    (total, s) =>
      total +
      getStrength((cx + s.x + width) % width, (cy + s.y + height) % height),
    0
  );
};

const moveCells = () => {
  for (const c of cells) {
    const forward = sense(c.x, c.y, c.angle);
    const left = sense(c.x, c.y, c.angle - sensingAngle);
    const right = sense(c.x, c.y, c.angle + sensingAngle);

    const max = Math.max(forward, left, right);
    if (left === max) c.angle -= turnSpeed;
    else if (right === max) c.angle += turnSpeed;

    c.x = (c.x + Math.cos(c.angle) + width) % width;
    c.y = (c.y + Math.sin(c.angle) + height) % height;
  }
};

const dropPheromones = () => {
  for (const c of cells) {
    const k = Math.round(c.y) * width + Math.round(c.x);
    grid[k] = Math.min(1, grid[k] + pheromoneStrength);
  }
};

const loop = () => {
  dissipate();
  moveCells();
  dropPheromones();
  render(grid);
  requestAnimationFrame(loop);
};

reset();
loop();
