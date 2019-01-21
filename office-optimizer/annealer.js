'use strict';

module.exports = function Annealer({
  initialState,
  iterations,
  easing,
  getNeighbor,
  getCost
}) {
  var temperatureStep = 1 / iterations;
  var temperature = 1;
  this.currentState = this.bestState = initialState;
  this.currentCost = this.bestCost = getCost(initialState);

  var maxDelta = 0;
  for (var i = 0; i < 1e4; i++) {
    var nextState = getNeighbor(this.currentState);
    var nextCost = getCost(nextState);
    maxDelta = Math.max(maxDelta, nextCost - this.currentCost);
    this.currentState = nextState;
    this.currentCost = nextCost;
  }

  console.log('maxDelta', maxDelta);
  var temperatureMult = -0.5 / maxDelta;

  this.iterate = () => {
    var nextState = getNeighbor(this.currentState);
    var nextCost = getCost(nextState);
    var costDelta = nextCost - this.currentCost;
    if (
      costDelta <= 0 ||
      Math.random() <
        Math.exp((costDelta / easing(temperature)) * temperatureMult)
    ) {
      this.currentState = nextState;
      this.currentCost = nextCost;
      if (nextCost < this.bestCost) {
        this.bestState = nextState;
        this.bestCost = nextCost;
      }
    }
    temperature = Math.max(0, temperature - temperatureStep);
  };
};
