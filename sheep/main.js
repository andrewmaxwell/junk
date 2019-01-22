import {makeRenderer} from './renderer.js';
import {makeBarGraph} from './barGraph.js';
import {makeStatCanvas} from './stats.js';
import {makeSim} from './sim.js';

const gameParams = {
  width: 200,
  height: 200,
  startingSheep: 1,
  grassGrowthRate: 0.0001, // each pixel gains x energy per iteration
  eatAmountMult: 0.1, // sheep can eat x * the amount grass on a cell per iteration

  grassEnergyMult: 0.02, // multiplier for amount of energy gained by eating
  energyLossRate: 0.0005, // each sheep loses x energy per iteration
  newbornEnergy: 0.01, // sheep start with x energy when they are born or reproduce
  ageAmt: 0.00003, // sheep age this amount per iteration, they get e^-age times the nutrition, so at age 1, that's 37%

  rockScale: 10,
  rockThreshold: 0.45, // rocks cover roughly this much of the screen

  raptorAppears: 100, // when sheep population reaches this level and there are no raptors, one appears
  smellDistance: 16,
  raptorSpeed: 0.02, // probability of moving two spaces
  eatDuration: 100
};

const barGraphParams = {
  width: 800,
  height: 300,
  cols: [{prop: 'age', color: 'gray'}, {prop: 'energy', color: 'green'}]
};

var speed = 1;
var slow = false;
var statFrequency = 10;

const statParams = {
  width: 800,
  height: 300,
  stats: [
    {prop: 'births', color: 'yellow', per: 200 / speed},
    {prop: 'deaths', color: 'blue', per: 200 / speed},
    {prop: 'killed', color: 'red', per: 2000 / speed},
    {prop: 'population', color: 'white', min: 0},
    {prop: 'grass', color: 'green', min: 0, disp: v => Math.round(v)},
    {prop: 'age', color: 'gray', disp: v => Math.round(v / gameParams.ageAmt)}
  ]
};

var sim, renderer, bars, stats, frame;

function init() {
  sim = makeSim(gameParams);
  renderer = makeRenderer(gameParams);
  bars = makeBarGraph(barGraphParams);
  stats = makeStatCanvas(statParams);
  frame = 0;

  document.body.innerHTML += '<style>canvas {float: left}</style>';
  document.body.style.margin = 0;

  renderer.canvas.style.height = renderer.canvas.style.width = '100vh';
  renderer.canvas.ondblclick = reset;

  document.body.appendChild(renderer.canvas);
  document.body.appendChild(bars.canvas);
  document.body.appendChild(stats.canvas);

  var gui = new window.dat.GUI();
  gui
    .add(gameParams, 'width', 20, 400)
    .step(1)
    .onChange(reset);
  gui
    .add(gameParams, 'height', 20, 400)
    .step(1)
    .onChange(reset);
  gui
    .add(gameParams, 'startingSheep', 1, 500)
    .step(1)
    .onChange(reset);
  gui
    .add(gameParams, 'rockThreshold', 0, 0.9)
    .step(0.01)
    .onChange(reset);
  gui.add(gameParams, 'rockScale', 1, 100).onChange(reset);
  gui.add(gameParams, 'smellDistance', 4, 50).step(1);

  var o = {speed: 2};
  gui.add(o, 'speed', {slow: 1, medium: 2, fast: 3}).onChange(() => {
    slow = o.speed == 1;
    speed = o.speed == 3 ? 10 : 1;
  });
  reset();
  loop();
}

function reset() {
  stats.reset();
  renderer.resize(gameParams.width, gameParams.height);
  renderer.reset();
  sim.reset();
}

function loop() {
  if (!slow) requestAnimationFrame(loop);

  for (var s = 0; s < speed; s++) {
    sim.iterate();
  }

  renderer.render(sim.getGrassCells(), sim.getRaptors(), sim.getSheeps());

  if (slow || frame % statFrequency === 0) {
    bars.render(sim.getSheeps());

    stats.update(sim.getStats());
    stats.render();
  }

  frame++;

  if (slow) setTimeout(loop, 200);
}

init();
