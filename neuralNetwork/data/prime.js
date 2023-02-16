import {toBinary} from '../utils.js';

const inputSize = 12;

const len = 2 ** inputSize;
const nums = [];
for (let i = 2; i <= len; i++) {
  while (nums[i]) i++;
  for (let j = i * i; j < len; j += i) nums[j] = 1;
}

export const getTrainingData = (size = 2 ** 11) => {
  const res = [];
  for (let i = 0; i < size; i++) {
    const num = Math.floor(Math.random() * 2 ** inputSize);
    res[i] = {
      input: toBinary(num, inputSize),
      num,
      expected: [nums[num] ? 0 : 1],
    };
  }
  return res;
};

export const layerSizes = [inputSize, inputSize * 2, inputSize * 2, 1];

export const doStuff = (nn) => nn.serialize();
