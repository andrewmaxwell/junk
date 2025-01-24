// https://www.codewars.com/kata/55b7bb74a0256d4467000070/train/javascript

function getPrimeFactors(n) {
  const result = [];
  let i = 2;
  while (i <= n) {
    if (i * i > n) {
      result.push(n);
      break;
    } else if (n % i === 0) {
      result.push(i);
      while (n % i === 0) n /= i;
    } else i++;
  }
  return result;
}

const properFractions = (d) => {
  const pf = getPrimeFactors(d);
  let count = d - 1;
  for (let i = 0; i < pf.length; i++) {
    count -= d / pf[i] - 1;
    for (let j = 0; j < i; j++) {
      count += d / (pf[i] * pf[j]) - 1;
    }
  }
  return count;
};

import {Test} from './test.js';
Test.assertEquals(properFractions(1), 0);
Test.assertEquals(properFractions(2), 1);
Test.assertEquals(properFractions(15), 8);
Test.assertEquals(properFractions(25), 20);

Test.assertEquals(properFractions(500000003), 500000002);
Test.assertDeepEquals(properFractions(608256), 184320);
// Test.assertDeepEquals(properFractions(123456789));

1 / 30;
// 2/30
// 3/30
// 4/30
// 5/30
// 6/30
7 / 30;
// 8/30
// 9/30
// 10/30
11 / 30;
// 12/30
13 / 30;
// 14/30
// 15/30
// 16/30
17 / 30;
// 18/30
19 / 30;
// 20/30
// 21/30
// 22/30
23 / 30;
// 24/30
// 25/30
// 26/30
// 27/30
// 28/30
29 / 30;

// d - 1
// - (d / 2 - 1)
// - (d / 3 - 1) + (d / 6 - 1)
// - (d / 5 - 1) + (d / 10 - 1) + (d / 15 - 1)
