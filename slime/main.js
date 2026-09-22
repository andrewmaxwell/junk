import {initGpu} from './gpu.js';
import {createGui, params} from './params.js';
import {trackPointer} from './input.js';
import {createSimulation} from './simulation.js';

const canvas = document.querySelector('canvas');
const mouse = trackPointer(canvas);
const sim = await createSimulation(await initGpu(canvas), canvas, mouse);

const loop = () => {
  for (let i = 0; i < params.world.stepsPerFrame; i++) sim.step();
  sim.draw();
  requestAnimationFrame(loop);
};

sim.reset();
requestAnimationFrame(loop);
createGui(sim.reset);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(sim.reset, 200);
});
