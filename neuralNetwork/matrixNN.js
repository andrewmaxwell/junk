// const {
//   random,
//   exp,
//   multiply,
//   dotMultiply,
//   mean,
//   abs,
//   subtract,
//   transpose,
//   add,
//   matrix,
// } = window.math;

// export class NeuralNetwork {
//   constructor({inputSize, layers, trainingData, learningRate}) {
//     this.layers = layers.map(({size, activation}, i) => ({
//       weights: random([i ? layers[i - 1].size : inputSize, size], -1, 1),
//       activation,
//     }));

//     this.inputMatrix = matrix(trainingData.map((r) => r.input));
//     this.targetMatrix = matrix(trainingData.map((r) => r.expected));
//     this.learningRate = learningRate;
//   }
//   predictBatch(inputMatrix) {
//     return this.layers.reduce(
//       (acc, {weights, activation}, i) =>
//         (this.layers[i].values = multiply(acc, weights).map(
//           activation.forward
//         )),
//       inputMatrix
//     );
//   }
//   predict(input) {
//     return this.predictBatch(matrix([input]))._data[0];
//   }
//   train() {
//     const {layers, targetMatrix, inputMatrix, learningRate} = this;
//     let acc = subtract(targetMatrix, this.predictBatch(inputMatrix));
//     for (let i = layers.length - 1; i >= 0; i--) {
//       const {weights, values, activation} = layers[i];
//       const layerDelta = dotMultiply(acc, values.map(activation.backward));
//       const prevLayerOutputs = i ? layers[i - 1].values : inputMatrix;
//       layers[i].weights = add(
//         weights,
//         multiply(
//           transpose(prevLayerOutputs),
//           multiply(layerDelta, learningRate)
//         )
//       );
//       acc = multiply(layerDelta, transpose(layers[i].weights));
//     }
//   }
//   getError() {
//     const {targetMatrix, inputMatrix} = this;
//     const error = subtract(targetMatrix, this.predictBatch(inputMatrix));
//     return mean(abs(error));
//   }
// }

// export const sigmoid = {
//   forward: (x) => 1 / (1 + exp(-x)),
//   backward: (x) => {
//     const fx = sigmoid.forward(x);
//     return fx * (1 - fx);
//   },
// };

// // export const relu = {
// //   forward: (x) => Math.max(0, x),
// //   backward: (x) => (x < 0 ? 0 : 1),
// // };
