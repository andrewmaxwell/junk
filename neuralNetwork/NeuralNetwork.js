const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const mapSum = (arr, func) => arr.reduce((a, b) => a + func(b), 0);

class Connection {
  constructor(from, to) {
    this.from = from;
    this.to = to;
    this.weight = Math.random() * 2 - 1;
    this.change = 0;
  }
  getWeightedDelta() {
    return this.weight * this.to.delta;
  }
  getWeightedValue() {
    return this.weight * this.from.value;
  }
  updateWeight(delta, learnRate, momentum) {
    this.change = learnRate * delta * this.from.value + momentum * this.change;
    this.weight += this.change;
  }
}

class Neuron {
  constructor() {
    this.bias = Math.random() * 2 - 1;
    this.delta = 0;
    this.value = 0;
    this.inputs = [];
    this.outputs = [];
  }
  connect(nextLayer) {
    for (const to of nextLayer.neurons) {
      const conn = new Connection(this, to);
      this.outputs.push(conn);
      to.inputs.push(conn);
    }
  }
  setValue(x) {
    this.value = x;
  }
  updateValue() {
    this.value = sigmoid(
      mapSum(this.inputs, (n) => n.getWeightedValue()) + this.bias
    );
  }
  setOutputDelta(expectedVal) {
    this.delta = (expectedVal - this.value) * this.value * (1 - this.value);
  }
  setDelta() {
    const err = mapSum(this.outputs, (o) => o.getWeightedDelta());
    this.delta = err * this.value * (1 - this.value);
  }
  updateWeightAndBias(learnRate, momentum) {
    this.inputs.forEach((n) => n.updateWeight(this.delta, learnRate, momentum));
    this.bias += learnRate * this.delta;
  }
}

class Layer {
  constructor(numNeurons) {
    this.neurons = [];
    for (let i = 0; i < numNeurons; i++) {
      this.neurons.push(new Neuron());
    }
  }
  connect(nextLayer) {
    this.neurons.forEach((n) => n.connect(nextLayer));
  }
  setValues(input) {
    this.neurons.forEach((n, i) => n.setValue(input[i]));
  }
  updateValues() {
    this.neurons.forEach((n) => n.updateValue());
  }
  setOutputDeltas(expected) {
    this.neurons.forEach((n, i) => n.setOutputDelta(expected[i]));
  }
  setDeltas() {
    this.neurons.forEach((n) => n.setDelta());
  }
  updateWeightsAndBiases(learnRate, momentum) {
    this.neurons.forEach((n) => n.updateWeightAndBias(learnRate, momentum));
  }
}

export class NeuralNetwork {
  constructor(layerSizes, learnRate = 0.5, momentum = 0.1) {
    this.learnRate = learnRate;
    this.momentum = momentum;
    this.layers = layerSizes.map((len) => new Layer(len));
    this.inputLayer = this.layers[0];
    this.outputLayer = this.layers[this.layers.length - 1];

    for (let l = 0; l < this.layers.length - 1; l++) {
      this.layers[l].connect(this.layers[l + 1]);
    }
  }
  #forward(input) {
    const {layers, inputLayer} = this;

    inputLayer.setValues(input);

    for (let l = 1; l < layers.length; l++) {
      layers[l].updateValues();
    }
  }
  #backpropagate(expected) {
    const {layers, learnRate, momentum, outputLayer} = this;

    outputLayer.setOutputDeltas(expected);

    for (let l = layers.length - 2; l >= 0; --l) {
      layers[l].setDeltas();
    }

    for (const layer of layers) {
      layer.updateWeightsAndBiases(learnRate, momentum);
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
    return this.outputLayer.neurons.map((t) => t.value);
  }
  getErrorRate(testingData, isEqual) {
    const errorRate = mapSum(
      testingData,
      (t) => !isEqual(this.run(t.input), t.expected)
    );
    return errorRate / testingData.length;
  }
}
