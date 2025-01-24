export const makeNeuralNet = (layerSizes) =>
  layerSizes.map((l, i) => {
    const layer = {values: new Float32Array(l), deltas: new Float32Array(l)};
    if (i) {
      layer.biases = new Float32Array(l).map(() => Math.random() - 0.5);
      layer.weights = Array.from({length: l}, () =>
        new Float32Array(layerSizes[i - 1]).map(() => Math.random() - 0.5)
      );
    }
    return layer;
  });

export const forward = (layers, input) => {
  layers[0].values.set(input);
  for (let l = 1; l < layers.length; l++) {
    const curr = layers[l];
    const prev = layers[l - 1];
    const currVals = curr.values;
    const prevVals = prev.values;
    const biases = curr.biases;
    const weights = curr.weights;
    const currLen = currVals.length;
    const prevLen = prevVals.length;
    for (let j = 0; j < currLen; j++) {
      const w = weights[j];
      let sum = biases[j];
      for (let k = 0; k < prevLen; k++) {
        sum += prevVals[k] * w[k];
      }
      currVals[j] = 1 / (1 + Math.exp(-sum));
    }
  }
  return layers[layers.length - 1].values;
};

export function train(layers, input, expected, lr = 0.25) {
  forward(layers, input);

  // compute deltas on last layer
  const last = layers[layers.length - 1];
  const lastValues = last.values;
  const lastDeltas = last.deltas;
  for (let i = 0; i < lastValues.length; i++) {
    const o = lastValues[i];
    lastDeltas[i] = (expected[i] - o) * o * (1 - o);
  }

  // compute deltas, weights, and biases on other layers, propagating backward
  for (let l = layers.length - 1; l >= 1; l--) {
    const curr = layers[l];
    const prev = layers[l - 1];
    const currWeights = curr.weights;
    const currBiases = curr.biases;
    const currDeltas = curr.deltas;
    const currLen = currDeltas.length;
    const prevValues = prev.values;
    const prevDeltas = prev.deltas;
    const prevLen = prevValues.length;

    // compute deltas
    for (let j = 0; j < prevLen; j++) {
      let err = 0;
      for (let k = 0; k < currLen; k++) {
        err += currWeights[k][j] * currDeltas[k];
      }
      const pv = prevValues[j];
      prevDeltas[j] = err * pv * (1 - pv);
    }

    // update weights and biases
    for (let j = 0; j < currLen; j++) {
      const delta = currDeltas[j];
      const weights_j = currWeights[j];
      for (let k = 0; k < prevLen; k++) {
        weights_j[k] += delta * prevValues[k] * lr;
      }
      currBiases[j] += delta * lr;
    }
  }
}

// export const getWeightsAndBiases = (layers) =>
//   layers.slice(1).map(({weights, biases}) => ({
//     weights: weights.map((w) => [...w]),
//     biases: [...biases],
//   }));

// export const importWeightsAndBiases = (layers, wab) => {
//   wab.forEach((w, i) => {
//     layers[i + 1].biases.set(w.biases);
//     w.weights.forEach((r, j) => layers[i + 1].weights[j].set(r));
//   });
// };
