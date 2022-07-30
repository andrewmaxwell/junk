const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const removeIndex = (arr, i) => [...arr.slice(0, i), ...arr.slice(i + 1)];

const putWeightsOnBarbell = (
  available,
  requiredWeight,
  left = [],
  right = []
) => {
  const leftRemaining = requiredWeight / 2 - sum(left);
  const rightRemaining = requiredWeight / 2 - sum(right);
  if (!leftRemaining && !rightRemaining) {
    return [left, right];
  } else if (leftRemaining) {
    for (let i = 0; i < available.length; i++) {
      if (available[i] > leftRemaining) continue;
      const sol = putWeightsOnBarbell(
        removeIndex(available, i),
        requiredWeight,
        [...left, available[i]],
        right
      );
      if (sol) return sol;
    }
  } else if (rightRemaining) {
    for (let i = 0; i < available.length; i++) {
      if (available[i] > rightRemaining) continue;
      const sol = putWeightsOnBarbell(
        removeIndex(available, i),
        requiredWeight,
        left,
        [...right, available[i]]
      );
      if (sol) return sol;
    }
  }
  return false;
};

import {Test} from './test.js';
// Test.failFast = true;
Test.assertDeepEquals(putWeightsOnBarbell([1, 5], 6), false);
Test.assertDeepEquals(putWeightsOnBarbell([1, 1, 1, 3], 6), [[1, 1, 1], [3]]);
Test.assertDeepEquals(putWeightsOnBarbell([1, 1], 2), [[1], [1]]);
Test.assertDeepEquals(putWeightsOnBarbell([1, 1], 0), [[], []]);
