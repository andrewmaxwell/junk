const makeArray = (length, func) => Array.from({length}, func);

const toOneHot = (num, length) => {
  const arr = new Array(length).fill(0);
  arr[num] = 1;
  return arr;
};

const targetFunc = (arr) => {
  let result = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] !== arr[i - 1]) result++;
  }
  return result;
};

const inputSize = 10;

export const makeTrainingData = (length) => {
  const dataSet = [];
  for (let i = 0; i < length; i++) {
    const input = makeArray(inputSize, () => (Math.random() < 0.5 ? 0 : 1));
    dataSet[i] = {input, expected: toOneHot(targetFunc(input), inputSize)};
  }
  return dataSet;
};

export const isEqual = (actual, expected) =>
  actual.every((x, i) => Math.round(x) === expected[i]);
