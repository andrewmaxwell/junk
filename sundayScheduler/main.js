import {getData} from './getData.js';
import {makeStats} from './stats.js';

const stats = makeStats(document.querySelector('#stats'));

const numWorkers = navigator.hardwareConcurrency;

const outputContainer = document.querySelector('#output');

let numDone = 0;
let allBestCost = Infinity;
let allBestOutput;

async function go() {
  const {people, roleSchedule} = await getData();

  console.log({people, roleSchedule});

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker('worker.js', {type: 'module'});

    worker.addEventListener(
      'message',
      ({data: {done, currentCost, bestCost, output}}) => {
        stats.add(i, currentCost);
        if (!done) return;

        if (bestCost < allBestCost) {
          allBestCost = bestCost;
          allBestOutput = output;
        }

        numDone++;
        if (numDone === numWorkers && outputContainer) {
          outputContainer.innerHTML = allBestOutput;
        }
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
