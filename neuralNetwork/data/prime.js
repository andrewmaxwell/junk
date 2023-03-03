import {toBinary} from '../utils.js';

const inputSize = 14;

const len = 2 ** inputSize;
const nums = [];
for (let i = 2; i <= len; i++) {
  while (nums[i]) i++;
  for (let j = i * i; j < len; j += i) nums[j] = 1;
}

export const getTrainingData = () => {
  const num = Math.floor(Math.random() * 2 ** inputSize);
  return {
    input: toBinary(num, inputSize),
    num,
    expected: [nums[num] ? 0 : 1],
  };
};

export const layerSizes = [inputSize, inputSize * 2, inputSize * 2, 1];

export const doStuff = (nn) => nn.serialize();
