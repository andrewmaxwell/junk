/**
 * Creates a simulated annealer.
 *
 * @template T
 * @param {(state: T) => number} getCost - A function that returns the cost of a given state.
 * @param {(state: T) => T} generateNeighbor - A function that produces a neighbor (candidate) state.
 * @param {T} initialState - The starting state of the annealer.
 * @param {number} initialTemperature - The initial temperature for the annealing process.
 * @param {number} maxIterations - The maximum number of iterations to perform.
 * @param {number} alpha - The factor by which temperature is multiplied each iteration.
 * @returns {{
 *   iterate: () => void,
 *   getResults: () => {
 *     currentState: T,
 *     currentCost: number,
 *     bestState: T,
 *     bestCost: number,
 *     temperature: number,
 *   }
 * }} An object with `iterate` and `getResults` methods.
 */
export function makeSimulatedAnnealer(
  getCost,
  generateNeighbor,
  initialState,
  initialTemperature,
  maxIterations,
  alpha,
) {
  let currentState = initialState;
  let currentCost = getCost(currentState);
  let bestState = initialState;
  let bestCost = currentCost;
  let temperature = initialTemperature;
  let iterations = 0;

  return {
    iterate: () => {
      if (iterations > maxIterations) return;

      const neighbor = generateNeighbor(currentState);
      const neighborCost = getCost(neighbor);
      const delta = neighborCost - currentCost;

      if (delta <= 0 || Math.random() < Math.exp(-delta / temperature)) {
        currentState = neighbor;
        currentCost = neighborCost;
        if (neighborCost < bestCost) {
          bestState = neighbor;
          bestCost = neighborCost;
        }
      }

      iterations++;
      temperature *= alpha;
    },

    getResults: () => ({
      currentState,
      currentCost,
      bestState,
      bestCost,
      temperature,
    }),
  };
}
