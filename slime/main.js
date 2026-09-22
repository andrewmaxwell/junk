import {initGpu} from './gpu.js';
import {params, setParams} from './params.js';
import {createGui} from './gui.js';
import {presets, randomSpecies} from './presets.js';
import {decodeParams, onUrlChange, syncUrl} from './share.js';
import {trackPointer} from './input.js';
import {createSimulation} from './simulation.js';

const canvas = document.querySelector('canvas');
const mouse = trackPointer(canvas);
const sim = await createSimulation(await initGpu(canvas), canvas, mouse);

const loop = () => {
  for (let i = 0; i < params.view.stepsPerFrame; i++) sim.step();
  sim.draw();
  requestAnimationFrame(loop);
};

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
  onChange: syncUrl,
  applyPreset: (name) => apply({species: presets[name]}, ['species']),
  randomize: () => apply({species: randomSpecies()}, ['species']),
  copyLink: () => navigator.clipboard.writeText(location.href),
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
