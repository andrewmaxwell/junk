// https://leetcode.com/problems/combination-sum/description/

/**
 * @param {number[]} candidates
 * @param {number} target
 * @return {number[][]}
 */
function combinationSum(candidates, target, result = []) {
  if (target < 0) return [];
  if (target === 0) return [result];
  return candidates.flatMap((x) =>
    combinationSum(
      candidates.filter((c) => c >= x),
      target - x,
      [...result, x]
    )
  );
}

import {Test} from './test.js';

Test.assertEquals(combinationSum([2, 3, 5], 8), [
  [2, 2, 2, 2],
  [2, 3, 3],
  [3, 5],
]);
Test.assertEquals(combinationSum([2], 1), []);
Test.assertEquals(combinationSum([1], 2), [[1, 1]]);
Test.assertEquals(combinationSum([1], 1), [[1]]);
