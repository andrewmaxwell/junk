import {makeGradient, makeRenderer} from '../sand/makeRenderer.js';

const numCells = 50000;

const params = {
  resolution: 0.5,
  sensingDistance: 3,
  sensingRadius: 3,
  sensingAngle: 0.75,
  moveSpeed: 1,
  turnSpeed: 0.25,
  strength: 0.04,
  fadeSpeed: 0.15,
  maxStrength: 0.2,
  scattering: 0.1,
};

let width, height, grid, grid2, sensingCoords, render, xCoords, yCoords, angles;

const calcSensingCoords = () => {
  sensingCoords = [];
  const rad = params.sensingRadius;
  for (let y = -rad; y < rad + 1; y++) {
    for (let x = -rad; x < rad + 1; x++) {
      if (Math.hypot(x, y) > rad) continue;
      sensingCoords.push({x, y});
    }
  }
};

const reset = () => {
  width = Math.floor(innerWidth * params.resolution);
  height = Math.floor(innerHeight * params.resolution);

  grid = new Float32Array(width * height);
  grid2 = new Float32Array(width * height);
  xCoords = new Float32Array(1e6);
  yCoords = new Float32Array(1e6);
  angles = new Float32Array(1e6);

  for (let i = 0; i < numCells; i++) {
    xCoords[i] = Math.random() * width;
    yCoords[i] = Math.random() * height;
    angles[i] = Math.random() * 2 * Math.PI;
  }

  render = makeRenderer(
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
  calcSensingCoords();
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
        (1 - params.fadeSpeed);
    }
  }
  [grid, grid2] = [grid2, grid];
};

const sense = (x, y, angle) => {
  const cx = x + params.sensingDistance * Math.cos(angle);
  const cy = y + params.sensingDistance * Math.sin(angle);
  const amt =
    sensingCoords.reduce(
      (total, s) =>
        total +
        getStrength(
          Math.floor(cx + s.x + width) % width,
          Math.floor(cy + s.y + height) % height
        ),
      0
    ) / sensingCoords.length;
  return amt > params.maxStrength ? -amt : amt;
};

const moveCells = () => {
  for (let i = 0; i < numCells; i++) {
    const forward = sense(xCoords[i], yCoords[i], angles[i]);
    const left = sense(xCoords[i], yCoords[i], angles[i] - params.sensingAngle);
    const right = sense(
      xCoords[i],
      yCoords[i],
      angles[i] + params.sensingAngle
    );

    const max = Math.max(forward, left, right);
    if (left === max) angles[i] -= params.turnSpeed;
    if (right === max) angles[i] += params.turnSpeed;
    angles[i] += (Math.random() - 0.5) * params.scattering;

    xCoords[i] =
      (xCoords[i] + params.moveSpeed * Math.cos(angles[i]) + width) % width;
    yCoords[i] =
      (yCoords[i] + params.moveSpeed * Math.sin(angles[i]) + height) % height;
  }
};

const dropPheromones = () => {
  for (let i = 0; i < numCells; i++) {
    const k = Math.round(yCoords[i]) * width + Math.round(xCoords[i]);
    grid[k] = Math.min(1, grid[k] + params.strength);
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

const gui = new window.dat.GUI();
gui.add(params, 'resolution', 0.1, 1).onChange(reset);
gui.add(params, 'sensingDistance', -10, 10);
gui.add(params, 'sensingRadius', 0, 10).onChange(calcSensingCoords);
gui.add(params, 'sensingAngle', 0, Math.PI);
gui.add(params, 'moveSpeed', 0, 5);
gui.add(params, 'turnSpeed', -0.2, 1);
gui.add(params, 'strength', 0, 0.1);
gui.add(params, 'fadeSpeed', 0, 0.2);
gui.add(params, 'maxStrength', 0, 1);
gui.add(params, 'scattering', 0, 1);
gui.add({reset}, 'reset');
window.addEventListener('resize', reset);

window.addEventListener('mousemove', (e) => {
  if (e.buttons !== 1) return;
  const x = Math.floor(e.pageX * params.resolution);
  const y = Math.floor(e.pageY * params.resolution);
  grid[y * width + x] = 100;
});
