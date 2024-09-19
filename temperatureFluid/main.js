import {color, makeRenderer} from '../sand/makeRenderer.js';
import {makeParticles} from './makeParticles.js';

const N = 100;
const size = (N + 2) ** 2;

const diffusionRate = 0.00001;
const viscosity = 0.0001;
const dt = 0.1;
const buoyantForce = -0.003;
const incompressibility = 20;

const startingTemperature = 100;

let xVel = new Float32Array(size);
let xVelPrev = new Float32Array(size);

let yVel = new Float32Array(size);
let yVelPrev = new Float32Array(size);

let temp = new Float32Array(size).fill(startingTemperature);
let tempPrev = new Float32Array(size).fill(startingTemperature);

const iceCubes = [
  {x: 25, y: 0, width: 6, height: 4},
  {x: 50, y: 3, width: 16, height: 6},
];

const IX = (i, j) => i + (N + 2) * j;

function setBoundaries(arr, xMult, yMult) {
  for (let i = 1; i <= N; i++) {
    arr[IX(0, i)] = xMult * arr[IX(1, i)];
    arr[IX(N + 1, i)] = xMult * arr[IX(N, i)];
    arr[IX(i, 0)] = yMult * arr[IX(i, 1)];
    arr[IX(i, N + 1)] = yMult * arr[IX(i, N)];
  }
  arr[IX(0, 0)] = 0.5 * (arr[IX(1, 0)] + arr[IX(0, 1)]);
  arr[IX(0, N + 1)] = 0.5 * (arr[IX(1, N + 1)] + arr[IX(0, N)]);
  arr[IX(N + 1, 0)] = 0.5 * (arr[IX(N, 0)] + arr[IX(N + 1, 1)]);
  arr[IX(N + 1, N + 1)] = 0.5 * (arr[IX(N, N + 1)] + arr[IX(N + 1, N)]);
}

function linearSolve(arr, arrPrev, amount, divisor, xMult, yMult) {
  for (let k = 0; k < incompressibility; k++) {
    for (let i = 1; i <= N; i++) {
      for (let j = 1; j <= N; j++) {
        const neighborSum =
          arr[IX(i - 1, j)] +
          arr[IX(i + 1, j)] +
          arr[IX(i, j - 1)] +
          arr[IX(i, j + 1)];
        arr[IX(i, j)] = (arrPrev[IX(i, j)] + amount * neighborSum) / divisor;
      }
    }
    setBoundaries(arr, xMult, yMult);
  }
}

function diffuse(arr, arrPrev, diff, xMult, yMult) {
  const a = dt * diff * N * N;
  linearSolve(arr, arrPrev, a, 1 + 4 * a, xMult, yMult);
}

function project(xVel, yVel, pressure, pressurePrev) {
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= N; j++) {
      const neighborPressure =
        xVel[IX(i - 1, j)] -
        xVel[IX(i + 1, j)] +
        yVel[IX(i, j - 1)] -
        yVel[IX(i, j + 1)];
      pressurePrev[IX(i, j)] = neighborPressure / N;
      pressure[IX(i, j)] = 0;
    }
  }
  setBoundaries(pressurePrev, 1, 1);
  setBoundaries(pressure, 1, 1);
  linearSolve(pressure, pressurePrev, 1, 4, 1, 1);

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= N; j++) {
      xVel[IX(i, j)] -=
        0.5 * N * (pressure[IX(i + 1, j)] - pressure[IX(i - 1, j)]);
      yVel[IX(i, j)] -=
        0.5 * N * (pressure[IX(i, j + 1)] - pressure[IX(i, j - 1)]);
    }
  }
  setBoundaries(xVel, -1, 1);
  setBoundaries(yVel, 1, -1);
}

const bind = (x) => Math.max(0.5, Math.min(N + 0.5, x));

// I still don't know what exactly this is doing
function advect(arr, arrPrev, xVelPrev, yVelPrev) {
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= N; j++) {
      const x = bind(i - dt * N * xVelPrev[IX(i, j)]);
      const y = bind(j - dt * N * yVelPrev[IX(i, j)]);
      const i0 = Math.floor(x);
      const j0 = Math.floor(y);
      arr[IX(i, j)] =
        (1 - x + i0) *
          ((1 - y + j0) * arrPrev[IX(i0, j0)] +
            (y - j0) * arrPrev[IX(i0, j0 + 1)]) +
        (x - i0) *
          ((1 - y + j0) * arrPrev[IX(i0 + 1, j0)] +
            (y - j0) * arrPrev[IX(i0 + 1, j0 + 1)]);
    }
  }
}

const fluidCanvas = document.querySelector('#fluidCanvas');
const getColor = (t) =>
  color(0, 0, Math.min(255, Math.max(0, 255 * (1 - t / startingTemperature))));
const renderFluid = makeRenderer(fluidCanvas, N + 2, N + 2, getColor);

const iterateParticles = makeParticles(fluidCanvas, (p) =>
  IX(Math.floor(p.x * N), Math.floor(p.y * N))
);

const loop = () => {
  [xVelPrev, xVel] = [xVel, xVelPrev];
  [yVelPrev, yVel] = [yVel, yVelPrev];

  xVelPrev.fill(0);
  yVelPrev.fill(0);
  tempPrev.fill(0);

  // buoyancy
  for (let i = 0; i < size; i++) {
    yVelPrev[i] = (temp[i] - startingTemperature) * buoyantForce * dt;
    yVel[i] += dt * yVelPrev[i];
  }

  // velocity step
  [xVelPrev, xVel] = [xVel, xVelPrev];
  [yVelPrev, yVel] = [yVel, yVelPrev];

  diffuse(xVel, xVelPrev, viscosity, -1, 1);
  diffuse(yVel, yVelPrev, viscosity, 1, -1);

  project(xVel, yVel, xVelPrev, yVelPrev);

  [xVelPrev, xVel] = [xVel, xVelPrev];
  [yVelPrev, yVel] = [yVel, yVelPrev];

  advect(xVel, xVelPrev, xVelPrev, yVelPrev);
  setBoundaries(xVel, -1, 1);
  advect(yVel, yVelPrev, xVelPrev, yVelPrev);
  setBoundaries(yVel, 1, -1);

  project(xVel, yVel, xVelPrev, yVelPrev);

  // temperature step
  [tempPrev, temp] = [temp, tempPrev];
  diffuse(temp, tempPrev, diffusionRate, 1, 1);

  [tempPrev, temp] = [temp, tempPrev];
  [xVelPrev, xVel] = [xVel, xVelPrev];
  [yVelPrev, yVel] = [yVel, yVelPrev];

  advect(temp, tempPrev, xVelPrev, yVelPrev);
  setBoundaries(temp, 1, 1);

  // ice cubes
  for (const {x, y, width, height} of iceCubes) {
    for (let i = x; i < x + width; i++) {
      for (let j = y; j < y + height; j++) {
        temp[IX(i, j)] = 0; // Enforce 0°C within the rectangle
      }
    }
  }

  renderFluid(temp);
  iterateParticles(xVelPrev, yVelPrev, dt * N);
  requestAnimationFrame(loop);
};
loop();
