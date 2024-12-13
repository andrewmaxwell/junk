// learned from this: https://jsfiddle.net/mikola/aj2vq/

import {fft2} from './fft2.js';
import {makeRenderer} from './makeRenderer.js';
import {precalculate} from './precalculate.js';
import {fieldMultiply, lerp, makeGrid, sigma, sigma2} from './utils.js';

const INNER_RADIUS = 4.0;
const OUTER_RADIUS = 3 * INNER_RADIUS;
const B1 = 0.278;
const B2 = 0.365;
const D1 = 0.267;
const D2 = 0.445;
const ALPHA_N = 0.028;
const ALPHA_M = 0.147;
const LOG_RES = 8; // grid will be 2**LOG_RES wide and tall

const width = 1 << LOG_RES;
const height = 1 << LOG_RES;

let currField = {re: makeGrid(width, height), im: makeGrid(width, height)};
let nextField = {re: makeGrid(width, height), im: makeGrid(width, height)};
const innerBuffer = {re: makeGrid(width, height), im: makeGrid(width, height)};
const outerBuffer = {re: makeGrid(width, height), im: makeGrid(width, height)};

const precalulated = precalculate(
  INNER_RADIUS,
  OUTER_RADIUS,
  width,
  height,
  LOG_RES
);

const step = () => {
  currField.im.forEach((row) => row.fill(0));

  fft2(1, LOG_RES, currField);
  fieldMultiply(width, height, currField, precalulated.inner, outerBuffer);
  fft2(-1, LOG_RES, outerBuffer);
  fieldMultiply(width, height, currField, precalulated.outer, innerBuffer);
  fft2(-1, LOG_RES, innerBuffer);

  nextField.re.forEach((row, i) =>
    row.forEach((_, j) => {
      const alive = sigma(outerBuffer.re[i][j], 0.5, ALPHA_M);
      nextField.re[i][j] = sigma2(
        innerBuffer.re[i][j],
        lerp(B1, D1, alive),
        lerp(B2, D2, alive),
        ALPHA_N
      );
    })
  );

  [nextField, currField] = [currField, nextField];
};

// add speckles
for (let i = 0; i < 3000; i++) {
  const u = Math.floor(Math.random() * (width - INNER_RADIUS));
  const v = Math.floor(Math.random() * (height - INNER_RADIUS));
  for (let x = 0; x < INNER_RADIUS; x++) {
    for (let y = 0; y < INNER_RADIUS; y++) {
      currField.re[u + x][v + y] = 1;
    }
  }
}

const drawField = makeRenderer(document.querySelector('canvas'), width, height);

const loop = () => {
  step();
  drawField(currField.re);
  requestAnimationFrame(loop);
};
loop();
