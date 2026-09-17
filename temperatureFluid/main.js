import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.min.js';
import {makeGradient, makeRenderer} from '../sand/makeRenderer.js';
import {makeParticles} from './makeParticles.js';
import {makePointer} from './makePointer.js';
import {makeSim} from './makeSim.js';

const res = 128;

// Mutated in place by the sliders. makeSim reads every field except `res` and
// `startingTemperature` live, each frame.
const params = {
  res,
  startingTemperature: 0.5,
  diffusionRate: 0.00001,
  viscosity: 0.0001,
  dt: 0.1,
  buoyantForce: -0.01,
  // Pushes circulation back into vortices to replace what the grid bleeds off.
  // 4 still holds the full source-to-source temperature span and roughly
  // triples the surviving curl; by 5 confinement takes the flow over and the
  // span collapses to the middle of the gradient. This sits below that edge.
  // Lowering viscosity makes the edge much closer -- at a viscosity of 3e-5
  // even 2 is enough to tip it -- so treat the two dials as one setting.
  vorticity: 3,
  // The pressure solve is the bulk of the frame and it converges slowly enough
  // that sweeps past this point buy almost nothing you can see: going to 512
  // changes the temperature field by ~8e-4, against a visible band of 0.24.
  iterations: 16,
  regions: [
    {x: res / 2, y: 3, width: 1, height: 1, targetTemp: 0, rate: 0.5},
    {x: res / 2, y: res - 4, width: 1, height: 1, targetTemp: 1, rate: 0.5},
  ],
};

// Outside the source cells the field stays within ~0.11 of startingTemperature,
// so map that band across the gradient rather than 0..1, which would render
// nearly everything as the middle color. Fixed rather than auto-ranging:
// recomputing min/max each frame makes the contrast pump as the flow evolves.
// Narrow the band for more contrast, widen it toward 0/1 for flatter color.
const view = {minTemp: 0.38, maxTemp: 0.62};

// Radius is in grid cells, rate is how hard one frame of painting pulls the
// temperature toward the brush's target.
const brush = {radius: 6, rate: 0.4};

const sim = makeSim(params);

const fluidCanvas = document.querySelector('#fluidCanvas');
const particleCanvas = document.querySelector('#particleCanvas');

const gradient = makeGradient([
  [0, 255, 255],
  [0, 0, 255],
  [0, 0, 0],
  [255, 0, 0],
  [255, 255, 0],
]);

const render = makeRenderer(fluidCanvas, res, res, (t) =>
  gradient((t - view.minTemp) / (view.maxTemp - view.minTemp)),
);

const particles = makeParticles(fluidCanvas, particleCanvas, sim.getVel);

// The particle canvas is the one on top, so it is what receives the pointer.
makePointer(particleCanvas, sim, brush);

const gui = new GUI();
gui.add(params, 'viscosity', 0, 0.002, 0.00001);
gui.add(params, 'diffusionRate', 0, 0.002, 0.00001);
gui.add(params, 'dt', 0.01, 0.3, 0.01);
gui.add(params, 'buoyantForce', -0.05, 0.05, 0.001);
gui.add(params, 'vorticity', 0, 8, 0.5);
gui.add(params, 'iterations', 1, 64, 1);
gui.add(view, 'minTemp', 0, 0.5, 0.005);
gui.add(view, 'maxTemp', 0.5, 1, 0.005);
gui.add(brush, 'radius', 1, 24, 1).name('brush radius');
gui.add(brush, 'rate', 0.02, 1, 0.02).name('brush rate');

const loop = () => {
  sim.iterate();
  render(sim.getTemperatures());
  particles.iterate();
  requestAnimationFrame(loop);
};
loop();
