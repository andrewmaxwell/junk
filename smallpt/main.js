import {color, makeRenderer} from '../sand/makeRenderer.js';

const width = 512;
const height = 384;
const canvas = document.querySelector('canvas');

const start = performance.now();
let frameCounter = 1;
const toInt = (x) => Math.min(1, x / 16 / frameCounter) ** 0.4 * 255;
const render = makeRenderer(
  canvas,
  width,
  height,
  (v, vals, i) =>
    color(toInt(vals[i * 3]), toInt(vals[i * 3 + 1]), toInt(vals[i * 3 + 2])),
  3
);

const sums = new Int32Array(width * height * 3);

const receiveMessage = ({data}) => {
  for (let i = 0; i < sums.length; i++) sums[i] += data[i];
  console.log(
    frameCounter +
      ' frames. ' +
      Math.round((performance.now() - start) / frameCounter) +
      ' ms/frame average'
  );
  frameCounter++;
  render(sums);
};

for (let i = 0; i < navigator.hardwareConcurrency; i++) {
  const w = new Worker('worker.js', {type: 'module'});
  w.onmessage = receiveMessage;
  w.postMessage({width, height});
}
