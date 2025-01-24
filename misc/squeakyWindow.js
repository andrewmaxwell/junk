// function sliding(nums, k) {
//   const result = [];
//   for (let i = 0; i <= nums.length - k; i++) {
//     let max = nums[i];
//     for (let j = 1; j < k; j++) {
//       let val = nums[i + j];
//       if (val > max) max = val;
//     }
//     result[i] = max;
//   }
//   return result;
// }

const findMax = (nums, k) =>
  k ? Math.max(nums[0], findMax(nums.slice(1), k - 1)) : -Infinity;

const sliding = (nums, k) =>
  k > nums.length ? [] : [findMax(nums, k), ...sliding(nums.slice(1), k)];

import {Test} from './test.js';
const doTest = (nums, k, expected) => {
  Test.assertDeepEquals(sliding(nums, k), expected);
};
doTest([1, 3, -1, -3, 5, 3, 6, 7], 3, [3, 3, 5, 5, 6, 7]);
doTest([-7, -8, 7, 5, 7, 1, 6, 0], 4, [7, 7, 7, 7, 7]);
doTest([7, 2, 4], 2, [7, 4]);
doTest([9, 11], 2, [11]);
doTest([9, 11, 12], 1, [9, 11, 12]);
doTest([], 50, []);
doTest([-1, -2, -3], 3, [-1]);
doTest([-1, -2, -3], 1, [-1, -2, -3]);
