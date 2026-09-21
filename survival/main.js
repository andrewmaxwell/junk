import {viewer} from '../primeSpiral/viewer.js';
import {Agent} from './Agent.js';
import {addFood} from './Food.js';
import {render} from './render.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

const params = {
  energyUse: 0.001,
  mutationRate: 0.03,
  mutationSize: 0.15,
  initScale: 8,
  hiddenSize: 8,
  memorySize: 8,
  sightDistance: 100,
  speedMult: 4,
  turnGain: 0.5,
  agentRad: 16,
  worldRadius: 1200,
  newFoodRate: 0.15,
  foodEnergy: 0.1,
  foodRad: 8,
  foodSpreadProb: 0.01,
  pathLength: 200,
  fastForward: false,
};

const randCoord = () => {
  const {worldRadius: rad} = params;
  while (true) {
    const x = (Math.random() * 2 - 1) * rad;
    const y = (Math.random() * 2 - 1) * rad;
    if (Math.hypot(x, y) < rad) return [x, y];
  }
};

let hashGrid,
  frameCounter = 0;

// Founders get random brains. Everything they learn, they learn by dying.
const makeAgent = (x, y) => hashGrid.insert(new Agent(params, x, y));

const reset = () => {
  frameCounter = 0;
  hashGrid = new SpatialHashGrid();
  for (let i = 0; i < 60; i++) makeAgent(...randCoord());
  for (let i = 0; i < 300; i++) {
    addFood(hashGrid, params, ...randCoord());
  }
};

let population = 0,
  maxGeneration = 0,
  foragingRate = 0;

// Population at a fixed food supply is a decent proxy for how good the agents
// have gotten: better foragers starve less, so the same food feeds more of them.
const history = [];
const historyMax = 240;

const iterate = () => {
  let agents = 0,
    gen = 0,
    rate = 0;
  for (const item of hashGrid.getAll()) {
    item.act(hashGrid, params);
    if (item instanceof Agent && item.energy > 0) {
      agents++;
      if (item.generation > gen) gen = item.generation;
      rate += item.foodEaten / item.age;
    }
  }
  population = agents;
  maxGeneration = gen;
  foragingRate = agents ? (rate / agents) * 1000 : 0;

  if (Math.random() < params.newFoodRate) {
    addFood(hashGrid, params, ...randCoord());
  }
  if (!agents) makeAgent(...randCoord()); // reseed rather than sit on a dead world
  if (frameCounter % 200 === 0) {
    history.push(agents);
    if (history.length > historyMax) history.shift();
  }
  frameCounter++;
};

reset();

function drawHistory(ctx) {
  if (history.length < 2) return;
  const x0 = 3,
    y0 = 64,
    w = 240,
    h = 60;
  const peak = Math.max(...history, 1);
  ctx.strokeStyle = '#bbb';
  ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = '#888';
  ctx.fillText(peak + '', x0 + w + 4, y0 + 8);
  ctx.strokeStyle = 'steelblue';
  ctx.beginPath();
  history.forEach((v, i) => {
    const x = x0 + (i / (historyMax - 1)) * w;
    const y = y0 + h - (v / peak) * h;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
}

viewer(
  (ctx) => {
    iterate();
    if (params.fastForward) {
      const start = performance.now();
      while (performance.now() - start < 1000) iterate();
    }
    render(ctx, params, hashGrid);
  },
  {
    onClick: ({x, y}) => makeAgent(x, y),
    drawStatic: (ctx) => {
      ctx.fillStyle = 'black';
      const lines = [
        frameCounter.toLocaleString() + ' iterations',
        population + ' agents',
        'generation ' + maxGeneration,
        foragingRate.toFixed(1) + ' food / 1k ticks / agent',
      ];
      lines.forEach((line, i) => ctx.fillText(line, 3, 12 + i * 12));
      drawHistory(ctx);
    },
  }
);

const gui = new window.dat.GUI();
gui.add(params, 'energyUse', 0, 0.004);
gui.add(params, 'mutationRate', 0, 1);
gui.add(params, 'mutationSize', 0, 0.5);
gui.add(params, 'initScale', 0.5, 12).onChange(reset);
gui.add(params, 'hiddenSize', 2, 12, 1).onChange(reset);
gui.add(params, 'memorySize', 0, 12, 1).onChange(reset);
gui.add(params, 'sightDistance', 10, 200);
gui.add(params, 'speedMult', 1, 10);
gui.add(params, 'turnGain', 0, 3);
gui.add(params, 'agentRad', 2, 30).onChange(() => {
  for (const item of hashGrid.getAll()) {
    item.updateImage?.(params);
  }
});
gui.add(params, 'worldRadius', 200, 2000);
gui.add(params, 'newFoodRate', 0, 3);
gui.add(params, 'foodSpreadProb', 0, 0.1);
gui.add(params, 'foodEnergy', 0, 1);
gui.add(params, 'foodRad', 2, 30);
gui.add(params, 'pathLength', 0, 500);
gui.add(params, 'fastForward');
gui.add({reset}, 'reset');
