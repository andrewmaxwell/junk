import {RunningMedian} from '../roomba/calcScore/RunningMedian.js';
import {doStuff, getTrainingData, layerSizes} from './data/prime.js';
import {NeuralNetwork} from './NeuralNetwork.js';
import {Renderer} from './Renderer.js';
import {isEqual} from './utils.js';

const neuralNet = (window.neuralNet = new NeuralNetwork(layerSizes));
const renderer = new Renderer(document.querySelector('#nn'));

const errorRate = [];
const times = new RunningMedian();

const loop = () => {
  if (document.hasFocus()) {
    const start = performance.now();
    neuralNet.train(getTrainingData());
    errorRate.push(neuralNet.getErrorRate(getTrainingData(100), isEqual));
    const time = times.push(performance.now() - start);

    renderer.render(neuralNet, errorRate, time);
  }
  requestAnimationFrame(loop);
};
loop();

window.addEventListener('keypress', (e) => {
  if (e.code === 'Space') {
    console.log(doStuff(neuralNet));
  }
});

console.log('trainingData sample', getTrainingData());
