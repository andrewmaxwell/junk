const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const reverseSigmoid = (x, val) => x * val * (1 - val);
const dotProduct = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

class Layer {
  constructor(numNeurons, prevLayerSize) {
    this.deltas = new Float32Array(numNeurons);
    this.values = new Float32Array(numNeurons);

    if (!prevLayerSize) return;
    this.biases = new Float32Array(numNeurons);
    this.weights = [];
    for (let i = 0; i < numNeurons; i++) {
      this.biases[i] = Math.random() * 2 - 1;
      this.weights[i] = new Float32Array(prevLayerSize);
      for (let j = 0; j < prevLayerSize; j++) {
        this.weights[i][j] = Math.random() * 2 - 1;
      }
    }
  }
  setValues(input) {
    this.values.set(input);
  }
  updateValues(prevLayer) {
    const {values, biases, weights} = this;
    for (let i = 0; i < biases.length; i++) {
      values[i] = sigmoid(biases[i] + dotProduct(prevLayer.values, weights[i]));
    }
  }
  setOutputDeltas(expected) {
    const {deltas, values} = this;
    for (let i = 0; i < deltas.length; i++) {
      deltas[i] = reverseSigmoid(expected[i] - values[i], values[i]);
    }
  }
  getErrorForNeuron(neuronIndex) {
    const {weights, deltas} = this;
    let err = 0;
    for (let i = 0; i < weights.length; i++) {
      err += weights[i][neuronIndex] * deltas[i];
    }
    return err;
  }
  updateDeltas(nextLayer) {
    const {deltas, values} = this;
    for (let i = 0; i < values.length; i++) {
      deltas[i] = reverseSigmoid(nextLayer.getErrorForNeuron(i), values[i]);
    }
  }
  updateWeightsAndBiases(prevLayer, learnRate) {
    const {biases, weights, deltas} = this;

    prevLayer.updateDeltas(this);

    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights[i].length; j++) {
        weights[i][j] += learnRate * deltas[i] * prevLayer.values[j];
      }
      biases[i] += learnRate * deltas[i];
    }
  }
}

export class NeuralNetwork {
  constructor(layerSizes, learnRate = 0.5) {
    this.learnRate = learnRate;
    this.layers = layerSizes.map((len, i) => new Layer(len, layerSizes[i - 1]));
    this.inputLayer = this.layers[0];
    this.outputLayer = this.layers[this.layers.length - 1];
  }
  #forward(input) {
    const {layers, inputLayer} = this;

    inputLayer.setValues(input);

    for (let i = 1; i < layers.length; i++) {
      layers[i].updateValues(layers[i - 1]);
    }
  }
  #backpropagate(expected) {
    const {layers, learnRate, outputLayer} = this;

    outputLayer.setOutputDeltas(expected);

    for (let i = layers.length - 1; i >= 1; --i) {
      layers[i].updateWeightsAndBiases(layers[i - 1], learnRate);
    }
  }
  train(trainingData) {
    for (const {input, expected} of trainingData) {
      this.#forward(input);
      this.#backpropagate(expected);
    }
  }
  run(input) {
    this.#forward(input);
    return this.outputLayer.values;
  }
  getErrorRate(testingData, isEqual) {
    let errorRate = 0;
    for (const {input, expected} of testingData) {
      errorRate += !isEqual(this.run(input), expected);
    }
    return errorRate / testingData.length;
  }
  serialize() {
    const {layers, learnRate} = this;
    return JSON.stringify({
      learnRate,
      numInputs: layers[1].weights[0].length,
      layers: layers.slice(1).map(({weights, biases}) => ({
        weights: weights.map((r) => [...r]),
        biases: [...biases],
      })),
    });
  }
}
