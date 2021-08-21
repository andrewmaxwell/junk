import {interp, objMap} from './utils.js';

export class GeneticAlg {
  constructor({
    popSize = 20,
    numBreeders = 4,
    numChampions = 1,
    mutationRate = 0.1,
    traits,
  }) {
    Object.assign(this, {
      popSize,
      numBreeders,
      numChampions,
      mutationRate,
      traits,
    });
    this.reset();
  }
  reset() {
    this.generation = 0;
    this.population = [];
    for (let i = 0; i < this.popSize; i++) {
      this.population[i] = {...this.makeRandom(), generation: 0};
    }
  }
  makeRandom() {
    return objMap(
      ({min, max}) => min + Math.random() * (max - min),
      this.traits
    );
  }
  mix(p1, p2) {
    return objMap(
      ({min, max}, k) =>
        Math.random() < this.mutationRate
          ? min + Math.random() * (max - min)
          : interp(p1[k], p2[k], Math.random()),
      this.traits
    );
  }
  nextGeneration() {
    this.population.sort((a, b) => b.score - a.score);
    const breeders = this.population.slice(0, this.numBreeders);
    this.generation++;
    this.population.length = this.numChampions;

    console.log(this.population[0].score);

    while (this.population.length < this.popSize) {
      let p1, p2;
      do {
        p1 = breeders[Math.floor(Math.random() * this.numBreeders)];
        p2 = breeders[Math.floor(Math.random() * this.numBreeders)];
      } while (p1 === p2);

      this.population.push({...this.mix(p1, p2), generation: this.generation});
    }
  }
}
