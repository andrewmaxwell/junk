import {GeneticAlg} from './geneticAlg.js';
import {makeTrebuchetSim} from './makeTrebuchetSim.js';
import {Renderer} from './renderer.js';
import {goals, traits} from './data.js';

const width = 800;
const height = 300;

const params = {
  simSpeed: 1,
  simLength: 200,
  popSize: 20,
  mutationRate: 0.1,
  breederRatio: 0.2,
  numChampions: 1,
  simsToDisplay: 6,
  optimizeFor: 'Distance Right',
  traits,
};

const makeScenario = (obj, index) => {
  const {sim, getData} = makeTrebuchetSim(obj);

  let canvas = document.querySelector(`#c${index}`);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'c' + index;
    document.body.appendChild(canvas);
  }
  const renderer = new Renderer(canvas, sim.engine, width, height);

  obj.iterate = () => {
    sim.step();
    obj.score = getData(goals)[params.optimizeFor];
  };
  obj.render = () => {
    renderer.render(
      `${params.optimizeFor}: ${Math.round(obj.score)} (gen ${obj.generation})`
    );
  };
  return obj;
};

let alg, frameCounter;

const startRound = () => {
  frameCounter = 0;
  for (let i = 0; i < alg.population.length; i++) {
    makeScenario(alg.population[i], i);
  }
};

const reset = () => {
  alg = new GeneticAlg(params);
  startRound();
};

const loop = async () => {
  requestAnimationFrame(loop);

  for (let i = 0; i < params.simsToDisplay && i < alg.population.length; i++) {
    alg.population[i].render();
  }

  for (let i = 0; i < params.simSpeed && frameCounter < params.simLength; i++) {
    for (const p of alg.population) p.iterate();
    frameCounter++;
  }

  if (frameCounter >= params.simLength) {
    alg.nextGeneration();
    startRound();
  }
};

reset();
loop();

const gui = new window.dat.GUI();
gui.add(params, 'simSpeed', 1, 20, 1);
gui.add(params, 'simLength', 50, 500, 1);
gui.add(params, 'popSize', 10, 100, 1).onChange((v) => (alg.popSize = v));
gui.add(params, 'mutationRate', 0, 1).onChange((v) => (alg.mutationRate = v));
gui.add(params, 'breederRatio', 0, 1).onChange((v) => (alg.breederRatio = v));
gui.add(params, 'simsToDisplay', 0, 16, 1);
gui.add(params, 'optimizeFor', Object.keys(goals));
gui.add({'Reset Population': reset}, 'Reset Population');
gui.add(
  {'Design Your Own': () => open('maker.html', '_blank')},
  'Design Your Own'
);
