import {makeRenderer, makeGradient} from './makeRenderer.js';
import {shuffle} from '../sheep/utils.js';

const width = 400;
const height = 300;

const maxTemp = 700; // kelvin
// const heatTransferSpeed = 0.01;

let particles;
let grid;
let pairs;

const canvas = document.querySelector('canvas');
const pressing = {};

const density = p => p.type.density - p.temp / 1e4;

const get = (x, y) =>
  x >= 0 && x < width && y >= 0 && y < height && grid[y * width + x];

const canSwap = (p, dx, dy) => {
  const o = get(p.x + dx, p.y + dy);
  return o && !o.type.static && density(p) > density(o);
};

const swapWith = (p, dx, dy) => {
  const nextId = (p.y + dy) * width + p.x + dx;
  const n = grid[nextId];
  n.x = p.x;
  n.y = p.y;
  grid[p.y * width + p.x] = n;
  grid[nextId] = p;
  p.x += dx;
  p.y += dy;
};

// const dirs = [
//   {x: 1, y: 0},
//   {x: 0, y: 1},
//   {x: -1, y: 0},
//   {x: 0, y: -1}
// ];
const moveFluid = p => {
  // let bestDir,
  //   minDensity = Infinity;
  // for (let i = 0; i < dirs.length; i++) {
  //   const d = dirs[i];
  //   const o = get(p.x + d.x, p.y + d.y);
  //   const den = o ? density(o) : Infinity;
  //   if (den < minDensity) {
  //     minDensity = den;
  //     bestDir = d;
  //   }
  // }
  // if (minDensity !== Infinity) {
  //   swapWith(p, bestDir.x, bestDir.y);
  // }
  if (canSwap(p, 0, 1)) {
    swapWith(p, 0, 1);
  } else {
    const l = canSwap(p, -1, 0);
    const r = canSwap(p, 1, 0);
    if (l && r) {
      const ld = density(get(p.x - 1, p.y));
      const rd = density(get(p.x + 1, p.y));
      swapWith(
        p,
        ld === rd ? (Math.random() < 0.5 ? 1 : -1) : ld < rd ? -1 : 1,
        0
      );
    } else if (l || r) {
      swapWith(p, l ? -1 : 1, 0);
    }
  }
};

const color = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
const types = {
  air: {
    color: color(0, 0, 0),
    move: moveFluid,
    density: 0.01,
    heatSpeed: 0.005
  },
  water: {
    color: color(0, 200, 255),
    move: moveFluid,
    density: 1,
    phaseUp: {temp: 500, type: 'vapor'},
    heatSpeed: 0.1
  },
  vapor: {
    color: color(100, 100, 100),
    move: moveFluid,
    density: 0.01,
    phaseDown: {temp: 300, type: 'water'},
    heatSpeed: 0.005
  },
  oil: {
    color: color(100, 75, 0),
    move: moveFluid,
    density: 0.8,
    heatSpeed: 0.1
  },
  iron: {color: color(203, 205, 205), static: true, heatSpeed: 0.2}
};

const temperatureGradient = makeGradient([
  [0, 0, 0],
  [0, 0, 255],
  [0, 255, 255],
  [255, 255, 0],
  [255, 0, 0],
  [255, 0, 255],
  [255, 255, 255]
]);

const reset = () => {
  particles = [];
  grid = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const type =
        x > 50 &&
        y > height / 2 &&
        x < width - 50 &&
        y < height - 50 &&
        !(x > 60 && x < width - 60 && y < height - 60)
          ? types.iron
          : Math.random() < 0.5 && x > 80 && x < width - 80 && y < height / 2
          ? types.water
          : types.air;
      const p = {x, y, type, temp: 20 + Math.random()};
      grid[y * width + x] = p;
      particles.push(p);
    }
  }

  pairs = [];
  for (let i = 0; i < particles.length; i++) {
    if (i % width < width - 1) pairs.push([i, i + 1]);
    if (Math.floor(i / width) < height - 1) pairs.push([i, i + width]);
  }
  // shuffle(particles);
};

const render = makeRenderer(canvas, width, height, o =>
  pressing.t ? temperatureGradient(o.temp / maxTemp) : o.type.color
);

const loop = () => {
  if (document.hasFocus()) {
    // particles.sort((a, b) => b.y - a.y);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const t = p.type;
      if (t.move) t.move(p);

      p.prevTemp = p.temp;
      if (t.phaseDown && p.temp < t.phaseDown.temp) {
        p.type = types[t.phaseDown.type];
      } else if (t.phaseUp && p.temp > t.phaseUp.temp) {
        p.type = types[t.phaseUp.type];
      }
    }

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const a = grid[p[0]];
      const b = grid[p[1]];
      const amt =
        (a.prevTemp - b.prevTemp) *
        Math.min(a.type.heatSpeed, b.type.heatSpeed);
      a.temp -= amt;
      b.temp += amt;
    }

    render(grid);
  }

  requestAnimationFrame(loop);
};

window.onkeyup = window.onkeydown = e => {
  pressing[e.key.toLowerCase()] = e.type === 'keydown';
  if (pressing.r) reset();
};

const mouseRad = 10;
canvas.onmousemove = e => {
  if (e.which === 1) {
    const x = Math.round((e.offsetX / canvas.clientWidth) * width);
    const y = Math.round((e.offsetY / canvas.clientHeight) * height);
    const minY = Math.max(0, y - mouseRad);
    const maxY = Math.min(height - 1, y + mouseRad);
    const minX = Math.max(0, x - mouseRad);
    const maxX = Math.min(width - 1, x + mouseRad);

    for (let i = minY; i <= maxY; i++) {
      for (let j = minX; j <= maxX; j++) {
        if (Math.hypot(i - y, j - x) < mouseRad)
          grid[i * width + j].temp += 100;
      }
    }
  }
};

reset();
loop();
