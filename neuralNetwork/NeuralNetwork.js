const sigmoid = (x) => 1 / (1 + Math.exp(-x));

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
  updateValues(prevLayer) {
    const {values, biases, weights} = this;
    for (let i = 0; i < biases.length; i++) {
      let sum = biases[i];
      for (let j = 0; j < prevLayer.values.length; j++) sum += prevLayer.values[j] * weights[i][j];
      values[i] = sigmoid(sum);
    }
  }
  // error is how much the neuron's output should change, the delta also accounts for the sigmoid's slope
  setDelta(i, error) {
    const value = this.values[i];
    this.deltas[i] = error * value * (1 - value);
  }
  updateWeightsAndBiases(prevLayer, learnRate) {
    const {biases, weights, deltas} = this;

    // use weights and deltas to update previous layer's deltas (except first layer, it has no deltas)
    if (prevLayer.deltas) {
      for (let i = 0; i < weights[0].length; i++) {
        let error = 0;
        for (let j = 0; j < weights.length; j++) error += weights[j][i] * deltas[j];
        prevLayer.setDelta(i, error);
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

// takes a point on the plane and outputs the probability that it's blue (label 1)
export class NeuralNetwork {
  constructor(layerSizes, learnRate) {
    this.learnRate = learnRate;
    this.layers = layerSizes.map((len, i) => new Layer(len, layerSizes[i - 1]));
  }
  predict(x, y) {
    const {layers} = this;
    layers[0].values[0] = x;
    layers[0].values[1] = y;
    for (let i = 1; i < layers.length; i++) layers[i].updateValues(layers[i - 1]);
    return layers[layers.length - 1].values[0];
  }
  // trains on random points one at a time
  train(points, iterations) {
    const {layers, learnRate} = this;
    for (let i = 0; i < iterations; i++) {
      const {x, y, label} = points[Math.floor(Math.random() * points.length)];
      const output = this.predict(x, y);

      // backpropagation
      layers[layers.length - 1].setDelta(0, label - output);
      for (let j = layers.length - 1; j >= 1; --j) {
        layers[j].updateWeightsAndBiases(layers[j - 1], learnRate);
      }
    }
  }
}
