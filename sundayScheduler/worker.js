import {getCost, getDetails} from './getCost.js';
import {getInitialState} from './getInitialState.js';
import {getGetNeighbor} from './getNeighbor.js';
import {makeSimulatedAnnealer} from './simulatedAnnealer.js';

const startingTemperature = 10_000; // bigger = more random at the beginning
const maxIterations = 200_000; // bigger = search longer
const alpha = 1 - 1 / 20_000; // bigger denominator = slower cooldown

self.onmessage = ({data: {people, roleSchedule}}) => {
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
    if (i % 100 === 0) {
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
    `\nTotal Cost: ${bestCost}`;

  self.postMessage({done: true, currentCost, bestCost, output});
};
