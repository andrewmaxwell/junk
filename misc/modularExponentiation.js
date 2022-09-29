function modExp(base, exponent) {
  let result = 1;
  base = base % 10;
  while (exponent > 0) {
    if (exponent & 1) result = (result * base) % 10;
    exponent >>= 1;
    base = (base * base) % 10;
  }
  return result;
}

const lastDigit = (arr) => {
  console.log(arr);
  return arr.reduceRight((res, x) => modExp(x, res), 1);
};

import {Test} from './test.js';
Test.assertSimilar(lastDigit([]), 1);
Test.assertSimilar(lastDigit([0, 0]), 1); // 0 ^ 0
Test.assertSimilar(lastDigit([0, 0, 0]), 0); // 0^(0 ^ 0) = 0^1 = 0
Test.assertSimilar(lastDigit([1, 2]), 1);
Test.assertSimilar(lastDigit([3, 4, 5]), 1);
Test.assertSimilar(lastDigit([4, 3, 6]), 4);
Test.assertSimilar(lastDigit([7, 6, 21]), 1);
Test.assertSimilar(lastDigit([12, 30, 21]), 6);
Test.assertSimilar(lastDigit([2, 2, 2, 0]), 4);
Test.assertSimilar(lastDigit([937640, 767456, 981242]), 0);
Test.assertSimilar(lastDigit([123232, 694022, 140249]), 6);
Test.assertSimilar(lastDigit([499942, 898102, 846073]), 6);
