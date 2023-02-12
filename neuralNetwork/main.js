import {isEqual, getTrainingData, layerSizes} from './data/grouping.js';
import {NeuralNetwork} from './NeuralNetwork.js';
import {Renderer} from './Renderer.js';
import {Stats} from './Stats.js';

const neuralNet = new NeuralNetwork(layerSizes);
const renderer = new Renderer(document.querySelector('#nn'));
const errorRate = new Stats(document.querySelector('#stats'), 400, 200);

const loop = () => {
  if (document.hasFocus()) {
    neuralNet.train(getTrainingData());
    renderer.render(neuralNet);
    errorRate.push(neuralNet.getErrorRate(getTrainingData(), isEqual));
    errorRate.render();
  }
  requestAnimationFrame(loop);
};
loop();
