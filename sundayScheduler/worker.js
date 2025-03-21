import {getCost, getDetails} from './getCost.js';
import {getInitialState} from './getInitialState.js';
import {getGetNeighbor} from './getNeighbor.js';
import {makeSimulatedAnnealer} from './simulatedAnnealer.js';

self.onmessage = ({
  data: {
    people,
    roleSchedule,
    startingTemperature,
    maxIterations,
    alpha,
    iterationsPerReport,
  },
}) => {
  const {iterate, getResults} = makeSimulatedAnnealer(
    getCost,
    getGetNeighbor(people),
    getInitialState(people, roleSchedule),
    startingTemperature,
    maxIterations,
    alpha,
  );

  for (let i = 0; i <= maxIterations; i++) {
    iterate();
    if (i % iterationsPerReport === 0) {
      const {currentCost} = getResults();
      self.postMessage({done: false, currentCost});
    }
  }

  const {currentCost, bestCost, bestState} = getResults();

  const output =
    bestState
      .map(({date, assignments}) => {
        const roles = Object.entries(assignments)
          .map(
            ([role, people]) =>
              `${role}: ${people.map((p) => p.name).join(', ')}`,
          )
          .join('; ');
        return `${
          date.getMonth() + 1
        }/${date.getDate()}/${date.getFullYear()}\t${roles}`;
      })
      .join('\n') +
    '\n\nScoring Notes:\n' +
    getDetails(bestState) +
    `\nTotal Cost: ${bestCost.toLocaleString()}`;

  self.postMessage({done: true, currentCost, bestCost, output});
};
