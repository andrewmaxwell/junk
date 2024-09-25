import {makeGradient, makeRenderer} from '../sand/makeRenderer.js';
import {makeParticles} from './makeParticles.js';
import {makeSim} from './makeSim.js';

const res = 64;

const sim = makeSim({
  res,
  startingTemperature: 0.5,
  diffusionRate: 0.00001,
  viscosity: 0.0001,
  dt: 0.1,
  buoyantForce: -0.1,
  iterations: 32,
  regions: [
    {x: res / 2, y: 3, width: 1, height: 1, tempDelta: -0.1},
    {x: res / 2, y: res - 4, width: 1, height: 1, tempDelta: 0.1},
  ],
});

const fluidCanvas = document.querySelector('#fluidCanvas');

const render = makeRenderer(
  fluidCanvas,
  res,
  res,
  makeGradient([
    [0, 255, 255],
    [0, 0, 255],
    [0, 0, 0],
    [255, 0, 0],
    [255, 255, 0],
  ])
);

const particles = makeParticles(fluidCanvas, sim.getVel);

const loop = () => {
  sim.iterate();
  render(sim.getTemperatures());
  particles.iterate();
  requestAnimationFrame(loop);
};
loop();
