import {isEqual, makeTrainingData} from './data/grouping.js';
import {NeuralNetwork} from './NeuralNetwork.js';
import {Renderer} from './Renderer.js';
import {Stats} from './Stats.js';

const inputSize = 10;

const neuralNet = new NeuralNetwork([
  inputSize,
  inputSize * 2,
  inputSize * 2,
  inputSize * 2,
  inputSize,
]);
const renderer = new Renderer(document.querySelector('#nn'));

console.log(neuralNet);

const errorRate = new Stats(document.querySelector('#stats'), 400, 200);

const loop = () => {
  neuralNet.train(makeTrainingData(200, inputSize));
  renderer.render(neuralNet);

  const testData = makeTrainingData(100, inputSize);
  errorRate.push(neuralNet.getErrorRate(testData, isEqual));

  requestAnimationFrame(loop);
};
loop();
