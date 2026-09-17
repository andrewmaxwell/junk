import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/dist/lil-gui.esm.min.js';
import {makeGradient, makeRenderer} from '../sand/makeRenderer.js';
import {makeParticles} from './makeParticles.js';
import {makePointer} from './makePointer.js';
import {makeSim} from './makeSim.js';

// 256 rather than 128 because the staggered solver earns it: the finer grid
// carries real structure at 1/256 of the domain, a scale 128 cannot represent
// at all, and is also markedly less compressible. With the SOR pressure solve
// this costs 13.4ms/frame in node, which clears the 16.7ms a 60fps frame gets
// with room for the renderer and particles on top.
//
// 256 is the largest resolution that fits: 288 already costs 16.9ms, and 320
// costs 21.1ms and pushes maxCFL to 0.91, close enough to 1 to be fragile.
// Measured detail is NOT monotonic in resolution here -- S(1/64) ran 0.302,
// 0.298, 0.361, 0.339, 0.406 across 192..320 -- because each run is a separate
// chaotic realization, so do not read a ranking into small differences.
const res = 256;
const N = res - 2;

// Mutated in place by the sliders. makeSim reads every field except `res` and
// `startingTemperature` live, each frame.
const params = {
  res,
  startingTemperature: 0.5,
  // Thermal diffusivity is the strongest detail lever in the sim, and it runs
  // opposite to intuition: lowering it sharpens the plumes. 1e-5 -> 3e-6 buys
  // +32% contrast at the 1/128 scale and +27% at 1/64, at identical cost, with
  // a cleaner velocity field. Do not push further -- at 1e-6 the plates stop
  // conducting enough heat into the fluid and convection never onsets at all
  // (interior SD of T collapses from 0.073 to 0.001: a dead, black field).
  diffusionRate: 0.000003,
  // Must stay here. Lowering viscosity *and* diffusivity together also stalls
  // the flow, and viscosity 0 fills the velocity field with grid noise.
  viscosity: 0.0001,
  dt: 0.05,
  buoyantForce: -0.03,
  // Pressure sweeps. This was 32 when the solve was plain Gauss-Seidel; the
  // solver now over-relaxes (SOR, see `omega` in makeSim.js), and 4 sweeps of
  // that beat 32 of the old one outright on divergence -- 1.7e-3 against
  // 4.8e-3, at a quarter of the cost.
  //
  // That single change is what took the sim from 56ms to 13ms a frame. Raising
  // it still helps divergence (8 sweeps reaches 1.0e-3) but costs the 60fps
  // budget, and the extra convergence is not visible.
  //
  // It briefly had to be 16: conservative flux advection turns leftover
  // divergence into a temperature source (`dT = -T * div`), so it cared
  // greatly how converged the projection was. That scheme was reverted — see
  // the flux-advection entry in CLAUDE.md — and with semi-Lagrangian
  // transport, which has no such term, 4 is sufficient again. Anyone
  // reintroducing a conservative scheme here should expect to raise this.
  iterations: 4,
  // Kept separate from `iterations` on purpose. These two used to share one
  // number, which meant lowering the pressure budget also quietly cut the
  // viscosity actually applied -- a cheaper solve looked like it came with a
  // free speed-up when it had really just stopped being viscous. Measured, 4
  // sweeps here is indistinguishable from 32 (divergence 1.68e-3 vs 2.03e-3,
  // grid noise 0.0022 vs 0.0023, identical SD) and saves 19ms a frame.
  diffusionIterations: 4,
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

// The full 0..1 range, which is a deliberate choice for the whole span rather
// than for maximum contrast. The plates sit at 0 and 1 but the convecting
// interior is much tighter -- measured at res 256 the percentiles are 10%
// 0.430, 50% 0.510, 90% 0.597 -- so a window this wide maps the interior into
// the middle of the gradient and renders about 38% of the frame near-black.
//
// The trade: `{0.4, 0.65}` drops that to 11% and is visibly richer in the
// interior, but it clips the plates and anything painted with the brush, which
// targets 0 and 1. Wide shows everything the brush can do; narrow shows more
// of what the convection is doing. Both are one slider away.
//
// Contrast windows do NOT transfer across resolutions, because interior SD
// falls as the grid refines (0.087 at res 128, 0.0735 at res 256). Re-measure
// if `res`, buoyancy or the plate targets change. Fixed rather than
// auto-ranging, because recomputing min/max each frame makes the contrast pump
// as the flow evolves.
const view = {minTemp: 0.1, maxTemp: 0.9};

// Radius is in grid cells, rate is how hard one frame of painting pulls the
// temperature toward the brush's target. Scaled with `res` so the brush stays
// the same size on screen -- 12 cells at 256 covers what 6 did at 128, and
// rounded so the default sits on the slider's step grid instead of snapping
// the first time it is touched.
const brush = {radius: Math.round(res / 21), rate: 0.4};

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
// Both of these are tight on purpose. The old 0..0.002 range with a 1e-5 step
// was coarser than the values that matter: it could not even express the 3e-6
// diffusionRate default, and it let viscosity reach 0, which fills the
// velocity field with grid noise. The useful band is roughly 1e-6..5e-5 for
// diffusivity (below 1e-6 convection stops onsetting) and 2e-5..5e-4 for
// viscosity.
gui.add(params, 'viscosity', 0.00002, 0.0005, 0.000005);
gui.add(params, 'diffusionRate', 0.000001, 0.00005, 0.0000005);
gui.add(params, 'dt', 0.01, 0.3, 0.01);
gui.add(params, 'buoyantForce', -0.05, 0.05, 0.001);
gui.add(params, 'iterations', 1, 64, 1);
gui.add(view, 'minTemp', 0, 0.5, 0.005);
gui.add(view, 'maxTemp', 0.5, 1, 0.005);
// Range scales with `res` too, so the brush covers the same fraction of the
// canvas at any resolution.
gui.add(brush, 'radius', 1, Math.round(res / 5), 1).name('brush radius');
gui.add(brush, 'rate', 0.02, 1, 0.02).name('brush rate');

const loop = () => {
  sim.iterate();
  render(sim.getTemperatures());
  particles.iterate();
  requestAnimationFrame(loop);
};
loop();
