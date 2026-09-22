import {initGpu} from './gpu.js';
import {setParams} from './params.js';
import {createPacer} from './pacer.js';
import {createGui} from './gui.js';
import {presets, randomSpecies} from './presets.js';
import {decodeParams, onUrlChange, syncUrl} from './share.js';
import {trackPointer} from './input.js';
import {createSimulation} from './simulation.js';

const canvas = document.querySelector('canvas');
const mouse = trackPointer(canvas);
const sim = await createSimulation(await initGpu(canvas), canvas, mouse);

const pacer = createPacer();
const loop = (now) => {
  const steps = pacer.stepsFor(now);
  const start = performance.now();
  for (let i = 0; i < steps; i++) sim.step();
  const stepped = sim.done();
  sim.draw();
  pacer.measure(steps, start, stepped, sim.done());
  requestAnimationFrame(loop);
};

await sim.calibrate(); // with default params, before any from the URL
setParams(decodeParams(location.hash.slice(1)));
sim.reset();
requestAnimationFrame(loop);

/** Applies new params (only to the given groups), then restarts from scratch. */
const apply = (overrides, groups) => {
  setParams(overrides, groups);
  gui.refresh();
  syncUrl();
  sim.reset();
};

const gui = createGui({
  reset: sim.reset,
  clearDrawing: sim.clearDrawing,
  onChange: syncUrl,
  applyPreset: (name) => apply({species: presets[name]}, ['species']),
  randomize: () => apply({species: randomSpecies()}, ['species']),
  isCustom: 'species' in decodeParams(location.hash.slice(1)),
});
onUrlChange((overrides) => {
  apply(overrides);
  gui.markCustom();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(sim.reset, 200);
});
