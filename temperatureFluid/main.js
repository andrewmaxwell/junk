import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.min.js';
import {makeGradient, makeRenderer} from '../sand/makeRenderer.js';
import {makeParticles} from './makeParticles.js';
import {makePointer} from './makePointer.js';
import {makeSim} from './makeSim.js';

const res = 128;
const N = res - 2;

// Mutated in place by the sliders. makeSim reads every field except `res` and
// `startingTemperature` live, each frame.
const params = {
  res,
  startingTemperature: 0.5,
  diffusionRate: 0.00001,
  viscosity: 0.0001,
  dt: 0.05,
  buoyantForce: -0.03,
  // The pressure solve is the bulk of the frame and it converges slowly enough
  // that sweeps past this point buy almost nothing you can see: going to 512
  // changes the temperature field by ~8e-4, against a visible band of 0.24.
  iterations: 16,
  // Rayleigh-Benard: a cold ceiling over a hot floor, as full-width plates
  // rather than the two single-cell sources this started with. A point source
  // can only produce a jet, but an entire layer of cold fluid resting on warm
  // fluid is genuinely unstable, and that instability generates the plumes and
  // vortices by itself -- which is why there is no vorticity confinement here
  // any more. Measured against the old point sources at the same viscosity:
  // the field reorganizes 3.3x as fast (unsteadiness 0.279 -> 0.919) and holds
  // 3x more curl than confinement at 0.5 was manufacturing.
  regions: [
    {x: 1, y: 1, width: N, height: 1, targetTemp: 0, rate: 0.5},
    {x: 1, y: N, width: N, height: 1, targetTemp: 1, rate: 0.5},
  ],
};

// The plates themselves sit at 0 and 1, but the convecting interior is much
// tighter than that -- measured, its 1st-to-99th percentile is 0.373 to 0.677.
// Mapping the full 0..1 would spend most of the gradient on values that never
// occur and render 38% of the frame near-black; this window covers the band
// that actually exists and cuts that to 16%. What it clips is essentially just
// the plate rows. Fixed rather than auto-ranging: recomputing min/max each
// frame makes the contrast pump as the flow evolves.
const view = {minTemp: 0.3, maxTemp: 0.7};

// Radius is in grid cells, rate is how hard one frame of painting pulls the
// temperature toward the brush's target.
const brush = {radius: 6, rate: 0.4};

const sim = makeSim(params);

// Perfectly uniform plates are perfectly symmetric, and a symmetric state
// stays symmetric forever -- the layer would just sit there conducting heat.
// Real convection is triggered by perturbation, so kick it once at startup.
// Unseeded Math.random, so every reload settles into a different flow.
for (let i = 0; i < 400; i++) {
  const target = Math.random() < 0.5 ? 0.53 : 0.47;
  sim.addHeat(Math.random(), Math.random(), target, 0.25, 2);
}

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
