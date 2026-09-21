import {Food} from './Food.js';
import {cloneNeuralNet, makeNeuralNet, forward} from './nn.js';
import {nnToImage} from './nnToImage.js';

const numSightDirs = 5; // hard coded so benchmark.js can reuse the same shape

const mod = (a, b) => ((a % b) + b) % b;

/** Layer sizes for a brain built from these params. One definition only. */
export const brainShape = ({hiddenSize = numSightDirs, memorySize = 0}) => [
  numSightDirs * 2 + 1 + Math.min(memorySize, hiddenSize),
  hiddenSize,
  1,
];

// Box-Muller. Additive noise, so a weight can grow as well as shrink.
const gauss = () => {
  let u = 0;
  while (!u) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

const mutateNet = (nn, {mutationRate, mutationSize}) => {
  for (let i = 1; i < nn.length; i++) {
    const {biases, weights} = nn[i];
    for (let j = 0; j < biases.length; j++) {
      if (Math.random() < mutationRate) biases[j] += gauss() * mutationSize;
      const row = weights[j];
      for (let k = 0; k < row.length; k++) {
        if (Math.random() < mutationRate) row[k] += gauss() * mutationSize;
      }
    }
  }
  return nn;
};

export class Agent {
  constructor(params, x, y, nn, generation = 0) {
    const {hiddenSize = numSightDirs, memorySize = 0} = params;
    this.x = x;
    this.y = y;
    this.angle = Math.random() * 2 * Math.PI;
    this.energy = 0.5; // die at 0, reproduce at 1
    this.path = [];
    this.age = 0;
    this.generation = generation;
    this.foodEaten = 0;
    this.inputs = new Array(numSightDirs * 2).fill(0);
    // Last tick's hidden layer, fed back in as extra inputs. This is what lets
    // a brain do anything that depends on the past -- keep searching in the
    // direction food was last seen, spiral outwards, give up on a bare patch.
    this.memory = new Array(Math.min(memorySize, hiddenSize)).fill(0);
    this.nn = nn || makeNeuralNet(brainShape(params), params.initScale);
    this.updateImage(params);
  }
  /** Sight in, change of heading out. Also rolls the memory forward. */
  decide(inputs, params) {
    const [turnAmount] = forward(this.nn, [
      this.energy,
      ...inputs,
      ...this.memory,
    ]);
    const hidden = this.nn[1].values;
    for (let i = 0; i < this.memory.length; i++) this.memory[i] = hidden[i];
    return (0.5 - turnAmount) * params.turnGain;
  }
  act(hashGrid, params) {
    const {inputs, touchingFood} = this.lookAround(hashGrid, params);
    this.angle += this.decide(inputs, params);
    this.inputs = inputs;
    hashGrid.update(
      this,
      this.x + params.speedMult * Math.cos(this.angle),
      this.y + params.speedMult * Math.sin(this.angle),
    );
    this.energy -= params.energyUse;
    // shift rather than slice: slice allocates a fresh array every tick, and
    // slice(-0) is slice(0), so pathLength 0 used to copy AND grow forever.
    if (params.pathLength > 0) {
      this.path.push({x: this.x, y: this.y});
      while (this.path.length > params.pathLength) this.path.shift();
    } else if (this.path.length) {
      this.path.length = 0;
    }
    this.age++;

    if (touchingFood) {
      this.energy += touchingFood.energy;
      touchingFood.energy = 0;
      this.foodEaten++;
    }

    if (this.energy >= 1) {
      hashGrid.insert(this.reproduce(params));
    } else if (this.energy <= 0) {
      hashGrid.remove(this);
    }
  }
  updateImage({agentRad}) {
    this.image = nnToImage(this.nn, agentRad);
  }
  lookAround(hashGrid, params) {
    const {sightDistance, agentRad, foodRad} = params;
    const nearestFoodDist = new Array(numSightDirs).fill(Infinity);
    const nearestAgentDist = new Array(numSightDirs).fill(Infinity);
    let touchingFood;

    for (const item of hashGrid.queryRange(
      this.x - sightDistance,
      this.y - sightDistance,
      this.x + sightDistance,
      this.y + sightDistance,
    )) {
      if (item === this || item.energy <= 0) continue;
      const dx = item.x - this.x;
      const dy = item.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > sightDistance) continue;

      let angle = mod(Math.atan2(dy, dx) - this.angle - Math.PI, 2 * Math.PI);

      const binIndex = Math.floor((angle / (2 * Math.PI)) * numSightDirs);

      if (item instanceof Food && dist < nearestFoodDist[binIndex]) {
        nearestFoodDist[binIndex] = dist;
        if (dist < agentRad + foodRad) touchingFood = item;
      } else if (item instanceof Agent && dist < nearestAgentDist[binIndex]) {
        nearestAgentDist[binIndex] = dist;
      }
    }

    // 0 = nothing there, 1 = right on top of me.
    // This direction matters a lot. With the old encoding (empty = 1) the
    // sight weights added a constant to every decision, so evolution could not
    // separate "how sharply do I turn by default" from "how do I react to
    // food" -- it just tuned the sum and settled for driving in circles.
    const inputs = new Array(numSightDirs * 2);
    for (let i = 0; i < numSightDirs; i++) {
      inputs[2 * i] = 1 - Math.min(1, nearestFoodDist[i] / sightDistance);
      inputs[2 * i + 1] = 1 - Math.min(1, nearestAgentDist[i] / sightDistance);
    }
    return {inputs, touchingFood};
  }
  reproduce(params) {
    this.energy = 0.5;
    return new Agent(
      params,
      this.x,
      this.y,
      mutateNet(cloneNeuralNet(this.nn), params),
      this.generation + 1,
    );
  }
}
