import {toOneHot} from '../utils.js';

const lengthOfLongestIncreasingSubsequence = (arr) => {
  const piles = [];
  for (const num of arr) {
    const pile = piles.find((pile) => pile[pile.length - 1] >= num);
    if (pile) pile.push(num);
    else piles.push([num]);
  }
  return piles.length;
};

const inputSize = 16;

export const getTrainingData = () => {
  const input = [];
  for (let j = 0; j < inputSize; j++) {
    input[j] = Math.round(Math.random() * inputSize) / inputSize;
  }
  const answer = lengthOfLongestIncreasingSubsequence(input);
  return {input, expected: toOneHot(answer, inputSize), answer};
};

export const layerSizes = [
  inputSize,
  inputSize,
  inputSize,
  inputSize,
  inputSize,
  inputSize,
  inputSize,
  inputSize,
];

export const doStuff = (nn) => nn.serialize();
