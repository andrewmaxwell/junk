import {makeRenderer} from './makeRenderer.js';
import {makeFlock} from './flock.js';

const numBirds = 250000;
const stepsPerSecond = 120; // the rate the flock constants are tuned for
const maxStep = 3; // below 40fps the flock slows down rather than going unstable

if (!navigator.gpu) {
  document.body.textContent = 'This needs WebGPU, which this browser does not support.';
  throw new Error('WebGPU is not available');
}

const flock = makeFlock(numBirds);
const {compute, render} = await makeRenderer(flock);

let lastTime = performance.now();

const loop = (time) => {
  flock.step(compute, Math.min(maxStep, ((time - lastTime) / 1000) * stepsPerSecond));
  lastTime = time;
  render();
  requestAnimationFrame(loop);
};

requestAnimationFrame(loop);
