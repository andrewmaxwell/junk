const trap = (arr) => {
  const max = Math.max(...arr);

  let height = 0;
  let result = 0;
  let left = 0;
  let right = arr.length - 1;

  while (arr[left] < max) {
    height = Math.max(height, arr[left]);
    result += height - arr[left];
    left++;
  }

  height = 0;
  while (right > left) {
    height = Math.max(height, arr[right]);
    result += height - arr[right];
    right--;
  }
  return result;
};

const {Test} = require('./test');
Test.assertDeepEquals(trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]), 6);
Test.assertDeepEquals(trap([4, 2, 0, 3, 2, 5]), 9);
Test.assertDeepEquals(trap([1, 2, 0, 2, 3, 1, 2, 100, 3, 4, 0, 4]), 10);
