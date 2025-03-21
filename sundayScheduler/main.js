import {getData} from './getData.js';
import {makeStats} from './stats.js';
import {validateData} from './validateData.js';

/*
TODO: weights by name+role
*/

const startingTemperature = 10_000; // bigger = more random at the beginning
const maxIterations = 250_000; // bigger = search longer
const alpha = 1 - 1 / 20_000; // bigger denominator = slower cooldown
const iterationsPerReport = 100;
const numWorkers = navigator.hardwareConcurrency;

const stats = makeStats(document.querySelector('#stats'));
const outputContainer = document.querySelector('#output');

let numDone = 0;
let allBestCost = Infinity;
let progress = 0;

async function go() {
  const {people, roleSchedule} = await getData();

  console.log({people, roleSchedule});

  const errors = validateData(people, roleSchedule);
  if (errors.length && outputContainer) {
    outputContainer.innerHTML = `ERRORS:\n${errors.join('\n')}`;
    return;
  }

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker('worker.js', {type: 'module'});

    worker.addEventListener(
      'message',
      ({data: {done, currentCost, bestCost, output}}) => {
        stats.add(i, currentCost);
        progress++;
        if (!done) return;

        if (bestCost < allBestCost && outputContainer) {
          allBestCost = bestCost;
          outputContainer.innerHTML = output;
        }
        numDone++;
      },
    );

    worker.postMessage({
      people,
      roleSchedule,
      startingTemperature,
      maxIterations,
      alpha,
      iterationsPerReport,
    });
  }

  const loop = () => {
    if (numDone === numWorkers) return;
    stats.draw(
      (100 * progress * iterationsPerReport) / numWorkers / maxIterations,
    );
    requestAnimationFrame(loop);
  };
  loop();
}

go();
