import {goals, traits} from './data.js';
import {makeTrebuchetSim} from './makeTrebuchetSim.js';
import {Renderer} from './renderer.js';
import {objMap} from './utils.js';

const width = 1200;
const height = 800;

const params = {
  simLength: 200,
  measure: 'Distance Right',
  ...objMap(({min, max}) => (max + min) / 2, traits),
};

const loadFromHash = () => {
  for (const p of location.hash.slice(1).split(',')) {
    const [key, val] = p.split(':');
    if (key in params)
      params[key] = isNaN(val) ? decodeURIComponent(val) : Number(val);
  }
};

let treb, renderer, frameCounter;

const reset = () => {
  location.hash = Object.entries(params)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  frameCounter = 0;
  treb = makeTrebuchetSim(params);
  renderer = new Renderer(
    document.querySelector(`#canvas`),
    treb.sim.engine,
    width,
    height
  );
};

const loop = async () => {
  requestAnimationFrame(loop);

  treb.sim.step();
  const score = treb.getData(goals)[params.measure];
  renderer.render(`${params.measure}: ${Math.round(score)}`);

  if (++frameCounter >= params.simLength) reset();
};

loadFromHash();
reset();
loop();

const gui = new window.dat.GUI();
gui.add(params, 'simLength', 50, 500, 1).onChange(reset);
gui.add(params, 'measure', Object.keys(goals)).onChange(reset);
for (const [key, {min, max}] of Object.entries(traits)) {
  gui.add(params, key, min, max, 0.001).onChange(reset);
}

addEventListener('hashchange', loadFromHash);
