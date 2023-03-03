import {doStuff, getTrainingData, layerSizes} from './data/bible.js';
import {NeuralNetwork} from './NeuralNetwork.js';
import {isEqual} from './utils.js';

const neuralNet = new NeuralNetwork(layerSizes);
let totalIterations = 0;

const speed = 1e5;

// eslint-disable-next-line no-constant-condition
while (true) {
  neuralNet.train(getTrainingData, speed);
  totalIterations += speed;
  console.log(totalIterations.toLocaleString(), 'total iterations');
  console.log(neuralNet.getErrorRate(getTrainingData, isEqual), 'error rate');
  console.log(doStuff(neuralNet));
  console.log();
}
