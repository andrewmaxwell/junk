export class SimulatedAnnealingSolver {
  constructor(opts) {
    this.getCost = opts.getCost; // a function that takes a state and returns a number
    this.generateNeighbor = opts.generateNeighbor; // a function that takes a state and returns a new state
  }
  init(initialState, initialTemperature, coolingFactor) {
    this.temperature = initialTemperature;
    this.coolingFactor = coolingFactor;
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
    return this.temperature > 1 - this.coolingFactor;
  }
}
