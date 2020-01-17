import {makeRenderer, makeGradient} from '../sand/makeRenderer.js';

const width = 800;
const height = 600;
const heatTransferSpeed = 0.01;

let grid1 = [...Array(width * height)].map(Math.random);
let grid2 = [];

const pairs = [];
for (let i = 0; i < grid1.length; i++) {
  if (i % width < width - 1) pairs.push([i, i + 1]);
  if (Math.floor(i / width) < height - 1) pairs.push([i, i + width]);
}

const render = makeRenderer(
  document.querySelector('canvas'),
  width,
  height,
  makeGradient([
    [0, 0, 0],
    [0, 0, 255],
    [255, 255, 255],
    [255, 0, 0],
    [255, 0, 255]
  ])
);

const loop = () => {
  for (let i = 0; i < grid1.length; i++) grid2[i] = grid1[i];
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const amt = (grid1[a] - grid1[b]) * heatTransferSpeed;
    grid2[a] -= amt;
    grid2[b] += amt;
  }
  const temp = grid1;
  grid1 = grid2;
  grid2 = temp;

  render(grid1);
  requestAnimationFrame(loop);
};

loop();
