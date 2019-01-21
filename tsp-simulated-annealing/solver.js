export class SimulatedAnnealingSolver {
  constructor(opts) {
    /* opts should contain these 4 properties:
     - initialTemperature: number
     - coolingFactor: number slightly less than 1
     - getCost: a function that takes a state and returns a number
     - generateNeighbor: a function that takes a state and returns a new state
    */

    Object.keys(opts).forEach(key => (this[key] = opts[key]));
  }
  init(initialState) {
    this.temperature = this.initialTemperature;
    this.currentState = this.bestState = initialState;
    this.minCost = this.maxCost = this.currentCost = this.getCost(
      this.currentState
    );
  }
  iterate() {
    let neighbor = this.generateNeighbor(this.currentState);
    let neighborCost = this.getCost(neighbor);
    let costDelta = neighborCost - this.currentCost;
    if (
      costDelta <= 0 ||
      Math.random() < Math.exp(-costDelta / this.temperature)
    ) {
      this.currentState = neighbor;
      this.currentCost = neighborCost;
      if (this.currentCost < this.minCost) {
        this.bestState = this.currentState;
        this.minCost = this.currentCost;
      }
      this.maxCost = Math.max(this.maxCost, this.currentCost);
    }
    this.temperature *= this.coolingFactor;
  }
}
