const limit = 20000;
const isNotPrime = new Uint16Array(limit);
for (let p = 2; p * p <= limit; ++p) {
  if (isNotPrime[p]) continue;
  for (let i = p * p; i <= limit; i += p) isNotPrime[i] = 1;
}

const solution = (n, m) => {
  const result = [];
  for (let i = 2; i < limit; i++) {
    if (isNotPrime[i]) continue;
    const x = BigInt(i) ** 4n;
    if (x >= n && x <= m) result.push(x);
    if (x > m) break;
  }
  return result;
};

// const numsWithThreeDivisors =
//   '2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997'
//     .split(',')
//     .map((n) => BigInt(n ** 4));

// const solution = (n, m) =>
//   numsWithThreeDivisors.filter((x) => x >= n && x <= m);

// hasThreeDivisors(16n);

import {Test} from './test.js';
Test.assertDeepEquals(solution(2n, 100n), [16n, 81n]);
Test.assertDeepEquals(solution(10000n, 100000n), [14641n, 28561n, 83521n]);
Test.assertDeepEquals(solution(624n, 625n), [625n]);
Test.assertDeepEquals(solution(625n, 626n), [625n]);
Test.assertDeepEquals(solution(734n, 735n), []);

const s = solution(75017480590815n, 72691938692499735n);
console.log(s[0], s[s.length - 1]);
// console.log(solution(0n, 10000000n));

// for (let i = 2; i < 20; i++) console.log(i, i ** 4);
