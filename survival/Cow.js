import {Food} from './Food.js';
import {makeNeuralNet, run} from './nn.js';
import {nnToImage} from './nnToImage.js';

const mod = (a, b) => ((a % b) + b) % b;

export class Cow {
  constructor(params, x, y) {
    this.x = x;
    this.y = y;
    this.angle = Math.random() * 2 * Math.PI;
    this.energy = 0.5; // die at 0, reproduce at 1
    this.nn = makeNeuralNet([
      params.numSightDirs * 2 + 1,
      params.numSightDirs,
      2,
    ]);
    this.path = [];
    this.age = 0;
    this.updateImage(params);
  }
  updateImage({agentRad}) {
    this.image = nnToImage(this.nn, agentRad);
  }
  lookAround(hashGrid, params) {
    const {numSightDirs, sightDistance, agentRad, foodRad} = params;
    const nearestFoodDist = new Array(numSightDirs).fill(Infinity);
    const nearestCowDist = new Array(numSightDirs).fill(Infinity);
    let touchingFood;

    for (const item of hashGrid.queryRange(
      this.x - sightDistance,
      this.y - sightDistance,
      this.x + sightDistance,
      this.y + sightDistance
    )) {
      if (item === this || item.energy <= 0) continue;
      const dx = item.x - this.x;
      const dy = item.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > sightDistance) continue;

      let angle = mod(Math.atan2(dy, dx) - this.angle, 2 * Math.PI);

      const binIndex = Math.floor((angle / (2 * Math.PI)) * numSightDirs);

      if (item instanceof Food && dist < nearestFoodDist[binIndex]) {
        nearestFoodDist[binIndex] = dist;
        if (dist < agentRad + foodRad) touchingFood = item;
      } else if (item instanceof Cow && dist < nearestCowDist[binIndex]) {
        nearestCowDist[binIndex] = dist;
      }
    }

    const inputs = new Array(numSightDirs * 2);
    for (let i = 0; i < numSightDirs; i++) {
      inputs[2 * i] = Math.min(1, nearestFoodDist[i] / sightDistance);
      inputs[2 * i + 1] = Math.min(1, nearestCowDist[i] / sightDistance);
    }
    return {inputs, touchingFood};
  }
  reproduce(params) {
    this.energy = 0.5;
    const kid = new Cow(params, this.x, this.y);
    for (let i = 1; i < kid.nn.length; i++) {
      for (let j = 0; j < kid.nn[i].biases.length; j++) {
        if (Math.random() > params.mutationRate) {
          kid.nn[i].biases[j] = this.nn[i].biases[j];
        }
        for (let k = 0; k < kid.nn[i].weights[j].length; k++) {
          if (Math.random() > params.mutationRate) {
            kid.nn[i].weights[j][k] = this.nn[i].weights[j][k];
          }
        }
      }
    }
    kid.updateImage(params);
    return kid;
  }
  act(hashGrid, params) {
    const {inputs, touchingFood} = this.lookAround(hashGrid, params);
    const [turnAmount, speed] = run(this.nn, [this.energy, ...inputs]);
    this.inputs = inputs;

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

    if (this.energy >= 1) {
      hashGrid.insert(this.reproduce(params));
    } else if (this.energy <= 0) {
      hashGrid.remove(this);
    }
  }
}
