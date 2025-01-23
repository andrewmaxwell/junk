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

export const run = (layers, input) => {
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
  run(layers, input);

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

// test

// const net = makeNeuralNet([2, 3, 3, 1]);

// const getTrainingData = () => {
//   const x = Math.random() * 2 - 1;
//   const y = Math.random() * 2 - 1;
//   return {
//     input: [x, y],
//     expected: [(x - 0.5) ** 2 + (y + 0.5) ** 2 <= 0.0625 ? 1 : 0],
//   };
// };

// let count = 0;
// for (let t = 0; t < 1e6; t++) {
//   for (let i = 0; i < 100; i++) {
//     const {input, expected} = getTrainingData();
//     train(net, input, expected);
//     count++;
//   }

//   let err = 0;
//   for (let i = 0; i < 100; i++) {
//     const {input, expected} = getTrainingData();
//     const result = run(net, input);
//     err += Math.abs(result[0] - expected[0]);
//   }

//   if (err < 1) {
//     console.log(`It took ${count.toLocaleString()} trainings to learn`);
//     break;
//   }
// }
