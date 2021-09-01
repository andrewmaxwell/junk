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

const gui = new window.dat.GUI();

const loadFromHash = () => {
  for (const p of location.hash.slice(1).split(',')) {
    const [key, val] = p.split(':');
    if (key in params)
      params[key] = isNaN(val) ? decodeURIComponent(val) : Number(val);
  }
};

let treb,
  renderer,
  frameCounter,
  bestScore = -Infinity,
  best = {};

const reset = () => {
  for (const c of gui.__controllers) c.updateDisplay();
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
  if (score > bestScore) {
    bestScore = score;
    best = {...params};
  }

  renderer.render(
    `${params.measure}: ${Math.round(score)} (Best: ${Math.round(bestScore)})`
  );

  if (++frameCounter >= params.simLength) reset();
};

loadFromHash();
reset();
loop();

gui.add(params, 'simLength', 50, 500, 1).onChange(reset);
gui.add(params, 'measure', Object.keys(goals)).onChange(reset);
for (const [key, {min, max}] of Object.entries(traits)) {
  gui.add(params, key, min, max, 0.001).onChange(reset);
}
gui.add(
  {
    Randomize: () => {
      for (const [t, {min, max}] of Object.entries(traits)) {
        params[t] =
          Math.round((min + Math.random() * (max - min)) * 1000) / 1000;
      }
      reset();
    },
  },
  'Randomize'
);
gui.add(
  {
    'Load Best': () => {
      for (const k in best) params[k] = best[k];
      reset();
    },
  },
  'Load Best'
);

addEventListener('hashchange', loadFromHash);
