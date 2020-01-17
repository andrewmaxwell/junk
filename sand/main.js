import {makeRenderer} from './makeRenderer.js';

const width = 300;
const height = 300;

const particles = [];
const grid = [];

const isEmpty = (p, dx, dy) => {
  const x = dx + p.x;
  const y = dy + p.y;
  const i = y * width + x;
  return (
    x >= 0 &&
    x < width &&
    y >= 0 &&
    y < height &&
    grid[i].type.density < p.type.density
  );
};

const move = (p, dx, dy) => {
  const nextId = (p.y + dy) * width + p.x + dx;
  const n = grid[nextId];
  n.x = p.x;
  n.y = p.y;
  grid[p.y * width + p.x] = n;
  grid[nextId] = p;
  p.x += dx;
  p.y += dy;
};

const moveLiquid = p => {
  if (isEmpty(p, 0, 1)) {
    move(p, 0, 1);
  } else {
    const l = isEmpty(p, -1, 0);
    const r = isEmpty(p, 1, 0);
    if (l || r) {
      move(p, l && r ? (Math.random() < 0.5 ? 1 : -1) : l ? -1 : 1, 0);
    }
  }
};

const dirs = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1]
];
const moveGas = p => {
  const emptyDirs = dirs.filter(d => isEmpty(p, d[0], d[1]));
  if (emptyDirs.length) {
    const d = emptyDirs[Math.floor(Math.random() * emptyDirs.length)];
    move(p, d[0], d[1]);
  }
};

const color = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
const types = {
  air: {color: color(0, 0, 0), move: moveGas, density: 0.01},
  water: {color: color(0, 200, 255), move: moveLiquid, density: 1},
  vapor: {color: color(100, 100, 100), move: moveGas, density: 0.01},
  oil: {color: color(100, 75, 0), move: moveLiquid, density: 0.8}
};

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const type =
      Math.random() < 0.5 && x > width / 4 && x < (width * 3) / 4
        ? y < height / 4
          ? types.water
          : y > (height * 3) / 4
          ? types.oil
          : types.air
        : types.air;
    const p = {x, y, type};
    grid[y * width + x] = p;
    particles.push(p);
  }
}

const render = makeRenderer(
  document.querySelector('canvas'),
  width,
  height,
  o => o.type.color
);

const loop = () => {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.type.move(p);
  }
  render(grid);

  requestAnimationFrame(loop);
};

loop();
