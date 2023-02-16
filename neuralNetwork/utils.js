export const toOneHot = (num, length) => {
  const arr = new Array(length).fill(0);
  arr[num] = 1;
  return arr;
};

export const fromOneHot = (arr) => {
  let index = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > arr[index]) index = i;
  }
  return index;
};

export const makeArray = (length, func) => Array.from({length}, func);

export const isEqual = (actual, expected) =>
  actual.every((x, i) => Math.round(x) === expected[i]);

export const toBinary = (num, length) =>
  num.toString(2).padStart(length, 0).split('').map(Number);
