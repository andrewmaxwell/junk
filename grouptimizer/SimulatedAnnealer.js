/** @template State */
export default class SimulatedAnnealer {
  /**
   * @param {{
   *  getCost: (state: State) => number,
   *  generateNeighbor: (state: State) => State,
   *  initialState: State,
   *  initialTemperature?: number,
   *  maxIterations?: number
   * }} opts
   */
  constructor({
    getCost,
    generateNeighbor,
    initialState,
    initialTemperature = 1,
    maxIterations = 1_000,
  }) {
    this.getCost = getCost;
    this.generateNeighbor = generateNeighbor;
    this.initialTemperature = initialTemperature;
    this.maxIterations = maxIterations;
    this.currentState = this.bestState = initialState;
    this.currentCost = this.minCost = this.maxCost = this.getCost(initialState);
    this.iterations = 0;
    this.isDone = false;
  }

  /**
   * Run one annealing step.
   * Call repeatedly until `isDone` is true.
   */
  iterate() {
    if (this.isDone) return;

    const neighbor = this.generateNeighbor(this.currentState);
    const neighborCost = this.getCost(neighbor);
    const costDelta = neighborCost - this.currentCost;

    const progress = this.iterations / this.maxIterations;
    this.temperature = this.initialTemperature * (1 - progress) ** 3;

    if (
      costDelta <= 0 ||
      Math.random() < Math.exp(-costDelta / this.temperature)
    ) {
      this.currentState = neighbor;
      this.currentCost = neighborCost;

      if (neighborCost < this.minCost) {
        this.bestState = neighbor;
        this.minCost = neighborCost;
      }
      this.maxCost = Math.max(this.maxCost, neighborCost);
    }

    this.iterations += 1;
    this.isDone = this.iterations >= this.maxIterations;
  }
}
