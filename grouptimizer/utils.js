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

/**
 * Returns a random index in [0, max) for which `accept(i)` is true.
 * Returns -1 if no acceptable index is found within the attempt budget.
 * @type {(max: number, accept: (i: number) => boolean) => number}
 */
export const randWhere = (max, accept) => {
  if (max <= 0) return -1;
  for (let tries = 0; tries < 100; tries++) {
    const r = Math.floor(Math.random() * max);
    if (accept(r)) return r;
  }
  return -1;
};

/**
 * Returns a new array with the elements of `arr` in random order.
 * @template T
 * @type {(arr: T[]) => T[]}
 */
export const shuffled = (arr) => {
  const a = arr.slice(0);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
