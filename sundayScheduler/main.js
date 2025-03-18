import StatGraph from '../grouptimizer/statGraph.js';
import {throttle} from '../neuralNetwork/utils.js';
import {getCost} from './getCost.js';
import {getData} from './getData.js';
import {getInitialState} from './getInitialState.js';
import {getGetNeighbor} from './getNeighbor.js';
import {makeSimulatedAnnealer} from './simulatedAnnealer.js';
import './types.js';

const startingTemperature = 100_000;
const maxIterations = 200_000;
const alpha = 1 - 1 / 10000;

const stats = new StatGraph(document.querySelector('#stats'));
const temperatureGraph = stats.addGraph({color: 'red', forceMin: 0});
const currentCostGraph = stats.addGraph({color: 'cyan'});

const output = document.querySelector('#output');

/**
 * Main entry point to run the scheduling + simulated annealing logic.
 * Fetches data, initializes the annealer, and iterates to produce a solution.
 */
async function go() {
  const {people, roleSchedule} = await getData();

  console.log({people, roleSchedule});

  const {iterate, getResults} = makeSimulatedAnnealer(
    (state) => getCost(state, false).cost,
    getGetNeighbor(people),
    getInitialState(people, roleSchedule),
    startingTemperature,
    maxIterations,
    alpha,
  );

  let counter = 0;

  const throttledFunc = throttle((itsPerFrame) => {
    for (let i = 0; i < itsPerFrame; i++) {
      iterate();
      const {currentCost, temperature} = getResults();
      temperatureGraph(temperature);
      currentCostGraph(currentCost);
      counter++;
    }

    stats.draw();
  });

  const loop = () => {
    if (counter < maxIterations) {
      throttledFunc();
      requestAnimationFrame(loop);
    } else if (output) {
      const {bestState} = getResults();

      output.innerHTML =
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
        getCost(bestState, true).details;
    }
  };

  loop();

  // const state = getInitialState(people, roleSchedule);
  // console.log(state);
  // getCost(state, true);
}

go();
