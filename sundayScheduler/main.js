import {getData} from './getData.js';
import {makeStats} from './stats.js';
import {validateData} from './validateData.js';

const stats = makeStats(document.querySelector('#stats'));

const numWorkers = navigator.hardwareConcurrency;

const outputContainer = document.querySelector('#output');

let numDone = 0;
let allBestCost = Infinity;

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
        if (!done) return;

        if (bestCost < allBestCost && outputContainer) {
          allBestCost = bestCost;
          outputContainer.innerHTML = output;
        }
        numDone++;
      },
    );

    worker.postMessage({people, roleSchedule});
  }

  const loop = () => {
    if (numDone === numWorkers) return;
    stats.draw();
    requestAnimationFrame(loop);
  };
  loop();
}

go();
