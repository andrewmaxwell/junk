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

export const train = (layers, input, expected, lr = 0.25) => {
  run(layers, input);
  const last = layers[layers.length - 1];
  for (let i = 0; i < last.values.length; i++) {
    const o = last.values[i];
    last.deltas[i] = (expected[i] - o) * o * (1 - o);
  }
  for (let i = layers.length - 1; i >= 1; i--) {
    const curr = layers[i];
    const prev = layers[i - 1];
    for (let j = 0; j < prev.values.length; j++) {
      const err = curr.weights.reduce(
        (a, w, k) => a + w[j] * curr.deltas[k],
        0
      );
      prev.deltas[j] = err * prev.values[j] * (1 - prev.values[j]);
    }
    for (let j = 0; j < curr.weights.length; j++) {
      const delta = curr.deltas[j];
      for (let k = 0; k < curr.weights[j].length; k++) {
        curr.weights[j][k] += delta * prev.values[k] * lr;
      }
      curr.biases[j] += delta * lr;
    }
  }
};

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

// const vals = [];
// for (let i = 0; i < 100000; i++) {
//   const nn = makeNeuralNet([4, 20, 1]);
//   vals.push(run(nn, Array(4).fill(0))[0]);
// }

// console.log(
//   Math.min(...vals),
//   Math.max(...vals),
//   vals.reduce((a, b) => a + b) / vals.length
// );
