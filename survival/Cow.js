import {Food} from './Food.js';
import {makeNeuralNet, run} from './nn.js';

const mutate = (val, mutationRate) =>
  Math.random() < mutationRate ? Math.random() - 0.5 : val;

const mod = (a, b) => ((a % b) + b) % b;

export class Cow {
  constructor({numBins}, x, y) {
    this.x = x;
    this.y = y;
    this.angle = Math.random() * 2 * Math.PI;
    this.energy = 0.5; // die at 0, reproduce at 1
    this.nn = makeNeuralNet([numBins * 2 + 1, numBins, 2]);
    this.path = [];
    this.age = 0;
  }
  lookAround(hashGrid, params) {
    const {numBins, visionRadius, cowRad, foodRad} = params;
    const nearestFoodDist = new Array(numBins).fill(Infinity);
    const nearestCowDist = new Array(numBins).fill(Infinity);
    let touchingFood;

    for (const item of hashGrid.queryRange(
      this.x - visionRadius,
      this.y - visionRadius,
      this.x + visionRadius,
      this.y + visionRadius
    )) {
      if (item === this || item.energy <= 0) continue;
      const dx = item.x - this.x;
      const dy = item.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > visionRadius) continue;

      let angle = mod(Math.atan2(dy, dx) - this.angle, 2 * Math.PI);

      const binIndex = Math.floor((angle / (2 * Math.PI)) * numBins);

      if (item instanceof Food && dist < nearestFoodDist[binIndex]) {
        nearestFoodDist[binIndex] = dist;
        if (dist < cowRad + foodRad) touchingFood = item;
      } else if (item instanceof Cow && dist < nearestCowDist[binIndex]) {
        nearestCowDist[binIndex] = dist;
      }
    }

    const inputs = new Array(numBins * 2);
    for (let i = 0; i < numBins; i++) {
      inputs[2 * i] = Math.min(1, nearestFoodDist[i] / visionRadius);
      inputs[2 * i + 1] = Math.min(1, nearestCowDist[i] / visionRadius);
    }
    return {inputs, touchingFood};
  }
  reproduce(params) {
    this.energy = 0.5;
    const kid = new Cow(params, this.x, this.y);
    for (let i = 1; i < kid.nn.length; i++) {
      for (let j = 0; j < kid.nn[i].biases.length; j++) {
        kid.nn[i].biases[j] = mutate(this.nn[i].biases[j], params.mutationRate);
        for (let k = 0; k < kid.nn[i].weights[j].length; k++) {
          kid.nn[i].weights[j][k] = mutate(this.nn[i].weights[j][k]);
        }
      }
    }
    return kid;
  }
  act(hashGrid, params) {
    const {inputs, touchingFood} = this.lookAround(hashGrid, params);
    const [turnAmount, speed] = run(this.nn, [this.energy, ...inputs]);

    this.angle += turnAmount - 0.5;
    hashGrid.update(
      this,
      this.x + params.speedMult * speed * Math.cos(this.angle),
      this.y + params.speedMult * speed * Math.sin(this.angle)
    );
    this.energy -= params.energyUse * (1 + speed);
    this.path.push({x: this.x, y: this.y});
    if (this.path.length > params.pathLength) {
      this.path = this.path.slice(-params.pathLength);
    }
    this.age++;

    if (touchingFood) {
      this.energy += touchingFood.energy;
      touchingFood.energy = 0;
    }

    if (this.energy >= 1) return this.reproduce(params);
  }
}
