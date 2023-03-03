// import {doStuff, getTrainingData, layerSizes} from './data/bible.js';
import {doStuff, getTrainingData, layerSizes} from './data/prime.js';
import {NeuralNetwork} from './NeuralNetwork.js';
// import {makeNeuralNetwork, train, getErrorRate} from './nnFunctional.js';
import {Renderer} from './Renderer.js';
import {isEqual, throttle} from './utils.js';

const neuralNet = (window.neuralNet = new NeuralNetwork(layerSizes));
// let neuralNet = makeNeuralNetwork(layerSizes);
const renderer = new Renderer(document.querySelector('#nn'));
const errorRate = [];
let totalIterations = 0;

const throttledFunc = throttle((itsPerFrame) => {
  neuralNet.train(getTrainingData, itsPerFrame);
  // train(neuralNet, getTrainingData(itsPerFrame));
  errorRate.push(neuralNet.getErrorRate(getTrainingData, isEqual));
  renderer.render(
    neuralNet,
    // {layers: neuralNet},
    errorRate,
    itsPerFrame,
    (totalIterations += itsPerFrame)
  );
});

const loop = () => {
  if (document.hasFocus()) throttledFunc();
  requestAnimationFrame(loop);
};
loop();

window.addEventListener('keypress', (e) => {
  if (e.code === 'Space') {
    console.log(doStuff(neuralNet));
  }
});

console.log('trainingData sample', Array.from({length: 10}, getTrainingData));
