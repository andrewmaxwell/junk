// const memoize =
//   (func, memo = {}) =>
//   (arg) =>
//     memo[arg] ?? (memo[arg] = func(arg));

// /**
//  * @param {number[]} nums
//  * @return {number}
//  */
// const jump = (nums) => {
//   const recurse = memoize((idx) => {
//     if (idx === nums.length - 1) return 0;

//     let min = Infinity;
//     for (let i = 1; i <= nums[idx] && i < nums.length; i++) {
//       min = Math.min(min, recurse(idx + i));
//     }
//     return min + 1;
//   });

//   return recurse(0);
// };

function jump(nums) {
  for (let i = 1; i < nums.length; i++) {
    nums[i] = Math.max(nums[i] + i, nums[i - 1]);
  }

  let result = 0;
  for (let i = 0; i < nums.length - 1; i = nums[i]) result++;
  return result;
}

import {Test} from './test.js';
Test.assertDeepEquals(jump([2, 3, 1, 1, 4]), 2);
Test.assertDeepEquals(jump([2, 3, 0, 1, 4]), 2);
Test.assertDeepEquals(
  jump([
    5, 6, 4, 4, 6, 9, 4, 4, 7, 4, 4, 8, 2, 6, 8, 1, 5, 9, 6, 5, 2, 7, 9, 7, 9,
    6, 9, 4, 1, 6, 8, 8, 4, 4, 2, 0, 3, 8, 5,
  ]),
  5
);
