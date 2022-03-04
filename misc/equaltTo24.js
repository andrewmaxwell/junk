const memoize =
  (func, cache = {}) =>
  (...args) => {
    const key = JSON.stringify(args);
    if (!cache.hasOwnProperty(key)) cache[key] = func(...args);
    return cache[key];
  };

const getVals = (a, b) => [
  [a + b, `${a}+${b}`],
  [a - b, `${a}-${b}`],
  [b - a, `${b}-${a}`],
  [a * b, `${a}*${b}`],
  [a / b, `${a}/${b}`],
  [b / a, `${b}/${a}`],
];

const getFormula = memoize((nums, amt) => {
  const [a, b, c, d] = nums;
  if (nums.length === 1) return a === amt && String(a);
  if (nums.length === 2) {
    const p = getVals(a, b).find((p) => p[0] === amt);
    if (p) return p[1];
  }
  // else if (nums.length === 2) {
  //   if (a + b === amt) return `${a}+${b}`;
  //   if (a - b === amt) return `${a}-${b}`;
  //   if (b - a === amt) return `${b}-${a}`;
  //   if (a * b === amt) return `(${a}*${b})`;
  //   if (a / b === amt) return `(${a}/${b})`;
  //   if (b / a === amt) return `(${b}/${a})`;
  // } else if (nums.length === 3) {
  //   for (const [m, n, t, s] of [
  //     [b, c, amt - a, a + '+'],
  //     [b, c, amt + a, a + '-'],
  //     [b, c, amt / a, a + '*'],
  //     [b, c, amt * a, a + '/'],
  //     [a, c, amt - b, b + '+'],
  //     [a, c, amt + b, b + '-'],
  //     [a, c, amt / b, b + '*'],
  //     [a, c, amt * b, b + '/'],
  //     [a, b, amt - c, c + '+'],
  //     [a, b, amt + c, c + '-'],
  //     [a, b, amt / c, c + '*'],
  //     [a, b, amt * c, c + '/'],
  //   ]) {
  //     const p = getFormula(m, n, t);
  //     if (p) return s + p;
  //   }
  // }

  console.log(nums, amt);
  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    const rest = [...nums.slice(0, i), ...nums.slice(i + 1)];

    const p0 = getFormula(rest, amt - n);
    if (p0) return `${p0}+${n}`;

    const p1 = getFormula(rest, amt + n);
    if (p1) return `${p1}-${n}`;

    const p2 = getFormula(rest, amt / n);
    if (p2) return `(${p2})*${n}`;

    const p3 = getFormula(rest, amt * n);
    if (p3) return `(${p3})/${n}`;
  }

  if (nums.length === 4) {
    for (const [p1, p2] of [
      [
        [a, b],
        [c, d],
      ],
      [
        [a, c],
        [b, d],
      ],
      [
        [a, d],
        [b, c],
      ],
    ]) {
      for (const [t, s] of getVals(p1[0], p1[1])) {
        const p = getFormula([t, p2[0], p2[1]], amt);
        if (p) return p;
      }
    }
  }
});
// console.log(getFormula([10, 5], 50));

const equalTo24 = (a, b, c, d) =>
  getFormula([a, b, c, d], 24) || "It's not possible!";

// https://www.codewars.com/kata/574be65a974b95eaf40008da/train/javascript
// https://www.codewars.com/kata/574e890e296e412a0400149c
console.log(getFormula([1, 1, 1, 13], 24));

import {Test} from './test.js';
// console.log(
//   'this one can return 1*2*3*4, your answer is:',
//   equalTo24(1, 2, 3, 4)
// );
// Test.assertSimilar(eval(equalTo24(1, 2, 3, 4)), 24);
// console.log(
//   'this one can return 2*(3+4+5), your answer is:',
//   equalTo24(2, 3, 4, 5)
// );
// Test.assertSimilar(eval(equalTo24(2, 3, 4, 5)), 24);
// console.log(
//   'this one can return (3+5-4)*6, your answer is:',
//   equalTo24(3, 4, 5, 6)
// );
// Test.assertSimilar(eval(equalTo24(3, 4, 5, 6)), 24);
// console.log(
//   'this one can return (1+1)*(13-1), your answer is:',
//   equalTo24(1, 1, 1, 13)
// );
// Test.assertSimilar(eval(equalTo24(1, 1, 1, 13)), 24);
// console.log(
//   'this one can return 13+(13-(12/6)), your answer is:',
//   equalTo24(13, 13, 6, 12)
// );
// Test.assertSimilar(eval(equalTo24(13, 13, 6, 12)), 24);
// console.log(
//   'this one can return 2*(13-(7/7)), your answer is:',
//   equalTo24(2, 7, 7, 13)
// );
// Test.assertSimilar(eval(equalTo24(2, 7, 7, 13)), 24);
// console.log(
//   'this one can return 6/(1-(3/4)), your answer is:',
//   equalTo24(4, 3, 1, 6)
// );
// Test.assertSimilar(eval(equalTo24(4, 3, 1, 6)), 24);
// Test.assertSimilar(equalTo24(1, 1, 1, 1), "It's not possible!");
// Test.assertSimilar(equalTo24(13, 13, 13, 13), "It's not possible!");
