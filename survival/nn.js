/**
 * `scale` is the initial weight magnitude, and it matters more than it looks.
 * Too small and every random brain sits in the flat middle of the sigmoid,
 * ignoring its inputs -- so a population of them has no variation in how they
 * react to what they see, and selection has nothing to grip. It can only tune
 * the constant term, which means evolving a nice circle and stopping there.
 */
export const makeNeuralNet = (
  /** @type {number[]} */ layerSizes,
  scale = 1,
) =>
  layerSizes.map((l, i) => ({
    values: new Float32Array(l),
    deltas: new Float32Array(l),
    biases: i
      ? new Float32Array(l).map(() => (Math.random() - 0.5) * scale)
      : new Float32Array(0),
    weights: i
      ? Array.from({length: l}, () =>
          new Float32Array(layerSizes[i - 1]).map(
            () => (Math.random() - 0.5) * scale,
          ),
        )
      : [],
  }));

export const forward = (
  /** @type {ReturnType<typeof makeNeuralNet>} */ layers,
  /** @type {number[]} */ input,
) => {
  layers[0].values.set(input);
  for (let l = 1; l < layers.length; l++) {
    const {values, weights, biases} = layers[l];
    const prev = layers[l - 1];
    const prevVals = prev.values;
    const currLen = values.length;
    const prevLen = prevVals.length;
    for (let j = 0; j < currLen; j++) {
      const w = weights[j];
      let sum = biases[j];
      for (let k = 0; k < prevLen; k++) {
        sum += prevVals[k] * w[k];
      }
      values[j] = 1 / (1 + Math.exp(-sum));
    }
  }
  return layers[layers.length - 1].values;
};

export function train(
  /** @type {ReturnType<typeof makeNeuralNet>} */ layers,
  /** @type {number[]} */ input,
  /** @type {number[]} */ expected,
  lr = 0.25,
) {
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

export const cloneNeuralNet = (
  /** @type {ReturnType<typeof makeNeuralNet>} */ layers,
) =>
  layers.map((l) => ({
    values: new Float32Array(l.values.length),
    deltas: new Float32Array(l.deltas.length),
    biases: Float32Array.from(l.biases),
    weights: l.weights.map((r) => Float32Array.from(r)),
  }));
