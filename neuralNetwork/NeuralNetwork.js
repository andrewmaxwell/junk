const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export class NeuralNetwork {
  constructor(layerSizes, learnRate = 0.3, momentum = 0.1) {
    this.learnRate = learnRate;
    this.momentum = momentum;
    this.layers = layerSizes.map((len) => {
      const layer = [];
      for (let i = 0; i < len; i++) {
        layer.push({
          bias: Math.floor(Math.random() * 2 - 1),
          delta: 0,
          value: 0,
          inputs: [],
          outputs: [],
        });
      }
      return layer;
    });

    for (let l = 1; l < this.layers.length; l++) {
      for (const to of this.layers[l]) {
        for (const from of this.layers[l - 1]) {
          const conn = {from, to, weight: Math.random() * 2 - 1, change: 0};
          from.outputs.push(conn);
          to.inputs.push(conn);
        }
      }
    }
  }
  forward(input) {
    const {layers} = this;
    for (let i = 0; i < layers[0].length; i++) {
      layers[0][i].value = input[i];
    }

    for (let l = 1; l < layers.length; l++) {
      for (const n of layers[l]) {
        n.value = sigmoid(
          n.inputs.reduce((sum, t) => sum + t.weight * t.from.value, n.bias)
        );
      }
    }
  }
  backpropagate(expected) {
    const {layers, learnRate, momentum} = this;
    for (let l = layers.length - 1; l >= 0; --l) {
      const currLayer = layers[l];
      for (let n = 0; n < currLayer.length; n++) {
        const {value, outputs} = currLayer[n];
        const err =
          l === layers.length - 1
            ? expected[n] - value
            : outputs.reduce((sum, {to, weight}) => sum + to.delta * weight, 0);

        currLayer[n].delta = err * value * (1 - value);
      }
    }

    for (const currLayer of layers) {
      for (const currNeuron of currLayer) {
        currNeuron.bias += learnRate * currNeuron.delta;
        for (const currConn of currNeuron.inputs) {
          currConn.change =
            learnRate * currNeuron.delta * currConn.from.value +
            momentum * currConn.change;
          currConn.weight += currConn.change;
        }
      }
    }
  }
  train(trainingData) {
    for (const {input, expected} of trainingData) {
      this.forward(input);
      this.backpropagate(expected);
    }
  }
  run(input) {
    this.forward(input);
    return this.layers[this.layers.length - 1].map((t) => t.value);
  }
  getErrorRate(trainingData, isEqual) {
    let errorRate = 0;
    for (const {input, expected} of trainingData) {
      const actual = this.run(input);
      if (!isEqual(actual, expected)) errorRate++;
    }
    return errorRate / trainingData.length;
  }
}
