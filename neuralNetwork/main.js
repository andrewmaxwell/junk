import {isEqual, makeTrainingData} from './data/grouping.js';
import {NeuralNetwork} from './NeuralNetwork.js';
import {Renderer} from './Renderer.js';
import {Stats} from './Stats.js';

export const trainingData = makeTrainingData(200);
const inputLength = trainingData[0].input.length;
const outputLength = trainingData[0].expected.length;

const neuralNet = new NeuralNetwork([inputLength, 10, outputLength]);
const renderer = new Renderer(document.querySelector('#nn'));

console.log(neuralNet);

const errorRate = new Stats(document.querySelector('#stats'), 400, 200);

const loop = () => {
  neuralNet.train(trainingData);
  renderer.render(neuralNet);
  errorRate.push(neuralNet.getErrorRate(trainingData, isEqual));
  requestAnimationFrame(loop);
};
loop();
