/**
 * Headless fitness benchmark: `node benchmark.js`
 *
 * The live sim can't tell you if brains are improving -- food intake there is
 * capped by the food spawn rate, not by skill, so the number is flat no matter
 * how good the agents get. This scores a brain in isolation instead: one agent,
 * a fixed food field, no death or reproduction, count what it eats.
 */
import {Agent, brainShape} from './Agent.js';
import {addFood} from './Food.js';
import {Food} from './Food.js';
import {getPretrainedNetwork} from './getPretrainedNetwork.js';
import {makeNeuralNet} from './nn.js';
import {SpatialHashGrid} from './SpatialHashGrid.js';

export const params = {
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
  worldRadius: 600,
  newFoodRate: 0.2,
  foodEnergy: 0.1,
  foodRad: 8,
  foodSpreadProb: 0.01,
  pathLength: 0,
};

const TICKS = 5000;
// WARNING: this arena scatters food uniformly at random and respawns it at
// random, so it rewards reactive sweeping and nothing else. Measured against
// the live patchy sim it gets the ranking BACKWARDS: brains with memory scored
// 106 here vs 140 without, yet sustained 27% MORE population in the sim.
// Use it to detect gross decay (it caught the original weight collapse).
// Do not use it to rank two brains that are close, and do not trust it at all
// for anything that depends on food being clumped.
const DEFAULT_FOOD = 200;
// Fixed arena, independent of params.worldRadius, so scores stay comparable
// across sims run with different world sizes.
const ARENA = 600;

/** Food eaten by one brain in one fixed arena. Deterministic given `seed`. */
export const scoreBrain = (nn, seed, opts = params, numFood = DEFAULT_FOOD) => {
  let s = seed >>> 0;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  const grid = new SpatialHashGrid();
  for (let i = 0; i < numFood; i++) {
    grid.insert(
      new Food(opts, (rnd() * 2 - 1) * ARENA, (rnd() * 2 - 1) * ARENA),
    );
  }

  const agent = new Agent(opts, 0, 0, nn);
  agent.angle = rnd() * 2 * Math.PI; // seeded, so a brain's score is reproducible
  let eaten = 0;
  for (let t = 0; t < TICKS; t++) {
    const {inputs, touchingFood} = agent.lookAround(grid, opts);
    agent.angle += agent.decide(inputs, opts);
    grid.update(
      agent,
      agent.x + opts.speedMult * Math.cos(agent.angle),
      agent.y + opts.speedMult * Math.sin(agent.angle),
    );
    if (touchingFood) {
      grid.remove(touchingFood);
      // respawn elsewhere so the arena doesn't deplete
      grid.insert(
        new Food(opts, (rnd() * 2 - 1) * ARENA, (rnd() * 2 - 1) * ARENA),
      );
      eaten++;
    }
  }
  return eaten;
};

export const fitness = (
  nn,
  seeds = [1, 2, 3, 4, 5, 6, 7, 8],
  opts = params,
  numFood = DEFAULT_FOOD,
) =>
  seeds.reduce((sum, seed) => sum + scoreBrain(nn, seed, opts, numFood), 0) /
  seeds.length;

if (import.meta.url === `file://${process.argv[1]}`) {
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const reps = 6;
  console.log(
    'random brain :',
    avg(Array.from({length: reps}, () => fitness(makeNeuralNet(brainShape(params), params.initScale)))).toFixed(1),
  );
  console.log(
    'pretrained   :',
    avg(
      Array.from({length: reps}, () =>
        fitness(getPretrainedNetwork(params), undefined, {
          ...params,
          memorySize: 0,
        }),
      ),
    ).toFixed(1),
  );
}
