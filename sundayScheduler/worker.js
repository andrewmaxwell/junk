import {getCost, getDetails} from './getCost.js';
import {getInitialState} from './getInitialState.js';
import {getGetNeighbor} from './getNeighbor.js';
import {makeSimulatedAnnealer} from './simulatedAnnealer.js';
import {formatDate} from './utils.js';

self.onmessage = ({
  data: {state, startingTemperature, maxIterations, alpha, iterationsPerReport},
}) => {
  const {iterate, getResults} = makeSimulatedAnnealer(
    getCost,
    getGetNeighbor(state),
    getInitialState(state),
    startingTemperature,
    maxIterations,
    alpha,
  );

  for (let i = 0; i < maxIterations; i++) {
    iterate();
    if (i % iterationsPerReport === 0) {
      const {currentCost} = getResults();
      self.postMessage({done: false, currentCost});
    }
  }

  const {currentCost, bestCost, bestState} = getResults();

  const output =
    bestState.schedule
      .map(({date, assignments}) => {
        const roles = Object.entries(assignments)
          .map(
            ([role, people]) =>
              `${role}: ${people.map((p) => p.name).join(', ')}`,
          )
          .join('; ');
        return [formatDate(date), roles].join('\t');
      })
      .join('\n') +
    '\n\nScoring Notes:\n' +
    getDetails(bestState) +
    `\nTotal Cost: ${bestCost.toLocaleString()}`;

  self.postMessage({done: true, currentCost, bestCost, output});
};
