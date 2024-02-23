import {Test} from './test.js';

const isPrime = (num, div = 2) =>
  div * div > num || (num % div > 0 && isPrime(num, div + 1));

const primes = new Set([
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47,
]);
for (let i = 2; i <= 50; i++) {
  Test.assertEquals(isPrime(i), primes.has(i));
}
