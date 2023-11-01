import {Grid} from './Grid.js';

const dirs = [
  {dx: -1, dy: -1, weight: 0.09235},
  {dx: 0, dy: -1, weight: 0.15765},
  {dx: 1, dy: -1, weight: 0.09235},
  {dx: -1, dy: 0, weight: 0.15765},
  {dx: 1, dy: 0, weight: 0.15765},
  {dx: -1, dy: 1, weight: 0.09235},
  {dx: 0, dy: 1, weight: 0.15765},
  {dx: 1, dy: 1, weight: 0.09235},
];

const params = {
  width: 300,
  height: 150,
  speed: 10,
  aDiffuse: 1,
  bDiffuse: 0.25,
  feed: 0.06,
  k: 0.06,
};

let grid, next;

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d', {alpha: false, antialias: false});

const reset = () => {
  const {width, height} = params;
  canvas.width = width;
  canvas.height = height;
  grid = new Grid(width, height);
  next = new Grid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      grid.set(x, y, 1, Math.random() < 0.005 ? 1 : 0);
    }
  }
};

const loop = () => {
  const {width, height, speed, aDiffuse, feed, bDiffuse, k} = params;
  for (let t = 0; t < speed; t++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const {a, b} = grid.get(x, y);
        let lapA = -a;
        let lapB = -b;
        for (const {dx, dy, weight} of dirs) {
          const nx = (x + dx + width) % width;
          const ny = (y + dy + height) % height;
          const {a, b} = grid.get(nx, ny);
          lapA += a * weight;
          lapB += b * weight;
        }

        next.set(
          x,
          y,
          a + (aDiffuse * lapA - a * b * b + feed * (1 - a)),
          b + (bDiffuse * lapB + a * b * b - (k + feed) * b)
        );
      }
    }

    [grid, next] = [next, grid];
  }

  ctx.putImageData(grid.toImageData(), 0, 0);
  requestAnimationFrame(loop);
};

reset();
loop();

const gui = new window.dat.GUI();
gui.add(params, 'width', 40, 400, 1).onChange(reset);
gui.add(params, 'height', 30, 300, 1).onChange(reset);
gui.add(params, 'speed', 1, 100);
gui.add(params, 'aDiffuse', 0, 2);
gui.add(params, 'bDiffuse', 0, 2);
gui.add(params, 'feed', 0, 0.1);
gui.add(params, 'k', 0, 0.1);
gui.add({reset}, 'reset');

const mouseRad = 5;
window.addEventListener('mousemove', ({clientX, clientY}) => {
  const {width, height} = params;
  const x = Math.floor((clientX / innerWidth) * width);
  const y = Math.floor((clientY / innerHeight) * height);

  for (let i = y - mouseRad; i <= y + mouseRad; i++) {
    for (let j = x - mouseRad; j <= x + mouseRad; j++) {
      grid.set(x, y, 0, 1);
    }
  }
});
