import {makeRenderer} from './makeRenderer.js';
import {makeFlock} from './flock.js';

const numBirds = 40000;
const stepsPerSecond = 120; // the rate the flock constants are tuned for
const maxStep = 3; // below 40fps the flock slows down rather than going unstable

const flock = makeFlock(numBirds);
const {render} = makeRenderer(flock);

let lastTime = performance.now();

const loop = (time) => {
  flock.step(Math.min(maxStep, ((time - lastTime) / 1000) * stepsPerSecond));
  lastTime = time;
  render();
  requestAnimationFrame(loop);
};

requestAnimationFrame(loop);
