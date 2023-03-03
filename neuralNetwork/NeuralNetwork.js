const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const reverseSigmoid = (x, val) => x * val * (1 - val);
const dotProduct = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

class Layer {
  constructor(numNeurons, prevLayerSize) {
    this.values = new Float32Array(numNeurons);

    if (!prevLayerSize) return;
    this.deltas = new Float32Array(numNeurons);
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
  updateNeuronDelta(neuronIndex, error) {
    this.deltas[neuronIndex] = reverseSigmoid(error, this.values[neuronIndex]);
  }
  setOutputDeltas(expected) {
    for (let i = 0; i < expected.length; i++) {
      this.updateNeuronDelta(i, expected[i] - this.values[i]);
    }
  }
  updateWeightsAndBiases(prevLayer, learnRate) {
    const {biases, weights, deltas} = this;

    // use weights and deltas to update previous layer's deltas (except first layer, it has no deltas)
    if (prevLayer.deltas) {
      for (let i = 0; i < weights[0].length; i++) {
        let err = 0;
        for (let j = 0; j < weights.length; j++) {
          err += weights[j][i] * deltas[j];
        }
        prevLayer.updateNeuronDelta(i, err);
      }
    }

    // calc weights and biases using deltas and prev layer's values
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights[i].length; j++) {
        weights[i][j] += learnRate * deltas[i] * prevLayer.values[j];
      }
      biases[i] += learnRate * deltas[i];
    }
  }
}

export class NeuralNetwork {
  constructor(layerSizes, learnRate = 0.3) {
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
  train(getTrainingData, iterations) {
    const {layers, learnRate, outputLayer} = this;
    for (let i = 0; i < iterations; i++) {
      const {input, expected} = getTrainingData();
      this.#forward(input);

      // backpropagation
      outputLayer.setOutputDeltas(expected);
      for (let j = layers.length - 1; j >= 1; --j) {
        layers[j].updateWeightsAndBiases(layers[j - 1], learnRate);
      }
    }
  }
  run(input) {
    this.#forward(input);
    return this.outputLayer.values;
  }
  getErrorRate(getTrainingData, isEqual) {
    let errorRate = 0;
    for (let i = 0; i < 100; i++) {
      const {input, expected} = getTrainingData();
      errorRate += !isEqual(this.run(input), expected);
    }
    return errorRate / 100;
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
