/** @type {(nums: number[]) => number} */
const average = (nums) => {
  let sum = 0;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i];
  }
  return sum / nums.length;
};

/** @type {(nums: number[]) => number} */
export const variance = (nums) => {
  const avg = average(nums);
  let squareDiffSum = 0;
  for (let i = 0; i < nums.length; i++) {
    squareDiffSum += (nums[i] - avg) ** 2;
  }
  return squareDiffSum / nums.length;
};

/** @type {(min: number, max?: number) => number} */
export const rand = (min, max) => {
  if (max === undefined) {
    max = min;
    min = 0;
  }
  return min + Math.floor(Math.random() * (max - min));
};

/** @type {(max: number, func: (number) => boolean) => number} */
export const randWhere = (max, func) => {
  let res;
  let limit = 100;
  do {
    res = Math.floor(Math.random() * max);
  } while (limit-- && func(res));
  if (!limit) {
    console.error('exceeded limit', res);
  }
  return res;
};
