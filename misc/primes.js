const MAX = 5e8;
const nums = Buffer.alloc(MAX);
const primes = [];

for (let c = 2; c < MAX / 2; ) {
  primes.push(c);
  for (let i = c * c; i < MAX; i += c) nums[i] = 1;
  while (nums[++c]);
}

const Primes = {
  *stream() {
    for (const p of primes) yield p;
  },
};

import {Test, it} from './test.js';
const verify = (n, ...a) =>
  function () {
    const stream = Primes.stream();
    for (let i = 0; i < n; ++i) stream.next();
    for (const v of a) Test.assertEquals(stream.next().value, v);
  };

it('0 - 10', verify(0, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29));
it('10 - 20', verify(10, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71));
it('100 - 110', verify(100, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601));
it(
  '1000 - 1010',
  verify(1000, 7927, 7933, 7937, 7949, 7951, 7963, 7993, 8009, 8011, 8017)
);

// const primes = [];
// for (let i = 2; i < MAX; i++) {
//   if (!nums[i]) primes.push(i);
// }

// console.log(primes);
