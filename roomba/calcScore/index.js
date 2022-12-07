import {RunningMedian} from './RunningMedian.js';

const workerAsync = (filePath, input, callback) => {
  const worker = new Worker(filePath, {type: 'module'});
  worker.addEventListener('message', ({data}) => callback(data));
  worker.postMessage(input);
  return worker;
};

const scoreDiv = document.querySelector('#score');
let worker;

export const calcScore = async (params) => {
  worker?.terminate();

  const scores = new RunningMedian();

  worker = workerAsync('./calcScore/worker.js', params, (message) => {
    const median = scores.push(message);
    scoreDiv.innerText = `Using the input code, a roomba cleans ${median.toFixed(
      1
    )}% of rooms on average after ${params.iterations.toLocaleString()} iterations. (Sample size ${
      scores.length
    })`;
    if (scores.length >= 1000) worker.terminate();
  });
};
