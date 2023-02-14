import {makeArray, toOneHot} from '../utils.js';

const targetFunc = (arr) => {
  let result = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== arr[i - 1]) result++;
  }
  return result;
};

const inputSize = 16;

export const getTrainingData = (size = 1000) =>
  makeArray(size, () => {
    const input = makeArray(inputSize, () => (Math.random() < 0.5 ? 0 : 1));
    return {input, expected: toOneHot(targetFunc(input), inputSize)};
  });

export const layerSizes = [inputSize, inputSize * 2, inputSize * 2, inputSize];

export const doStuff = (nn) => nn.serialize();
