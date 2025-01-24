import {Food} from './Food.js';
import {makeNeuralNet, forward} from './nn.js';
import {nnToImage} from './nnToImage.js';

const numSightDirs = 5; // hard coded so we can use pre-trained data

const mod = (a, b) => ((a % b) + b) % b;

const mutate = (params) =>
  Math.random() < params.mutationRate ? Math.random() * 2 - 1 : 1;

export class Agent {
  constructor(params, x, y, nn) {
    this.x = x;
    this.y = y;
    this.angle = Math.random() * 2 * Math.PI;
    this.energy = 0.5; // die at 0, reproduce at 1
    this.path = [];
    this.age = 0;
    this.nn = nn || makeNeuralNet([numSightDirs * 2 + 1, numSightDirs, 1]);
    this.updateImage(params);
  }
  act(hashGrid, params) {
    const {inputs, touchingFood} = this.lookAround(hashGrid, params);
    const [turnAmount] = forward(this.nn, [this.energy, ...inputs]);
    this.inputs = inputs;

    this.angle += 0.5 - turnAmount;
    hashGrid.update(
      this,
      this.x + params.speedMult * Math.cos(this.angle),
      this.y + params.speedMult * Math.sin(this.angle),
    );
    this.energy -= params.energyUse;
    this.path.push({x: this.x, y: this.y});
    if (this.path.length > params.pathLength) {
      this.path = this.path.slice(-params.pathLength);
    }
    this.age++;

    if (touchingFood) {
      this.energy += touchingFood.energy;
      touchingFood.energy = 0;
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

    const inputs = new Array(numSightDirs * 2);
    for (let i = 0; i < numSightDirs; i++) {
      inputs[2 * i] = Math.min(1, nearestFoodDist[i] / sightDistance);
      inputs[2 * i + 1] = Math.min(1, nearestAgentDist[i] / sightDistance);
    }
    return {inputs, touchingFood};
  }
  reproduce(params) {
    this.energy = 0.5;
    const kid = new Agent(params, this.x, this.y);
    for (let i = 1; i < kid.nn.length; i++) {
      for (let j = 0; j < kid.nn[i].biases.length; j++) {
        if (Math.random() > params.mutationRate) {
          kid.nn[i].biases[j] = this.nn[i].biases[j] * mutate(params);
        }
        for (let k = 0; k < kid.nn[i].weights[j].length; k++) {
          if (Math.random() > params.mutationRate) {
            kid.nn[i].weights[j][k] = this.nn[i].weights[j][k] * mutate(params);
          }
        }
      }
    }
    kid.updateImage(params);
    return kid;
  }
}
