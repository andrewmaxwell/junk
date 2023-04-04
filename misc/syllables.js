const nums = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 1,
  6: 1,
  7: 2,
  8: 1,
  9: 1,
  10: 1,
  11: 3,
  12: 1,
  13: 2,
  14: 2,
  15: 2,
  16: 2,
  17: 3,
  18: 2,
  19: 2,
};

const tens = {
  2: 2,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  7: 3,
  8: 2,
  9: 2,
};

const syllables = (num) => {
  if (!num) return 0;
  if (num < 20) return nums[num];
  if (num < 100) return tens[Math.floor(num / 10)] + syllables(num % 10);
  if (num < 1000)
    return syllables(Math.floor(num / 100)) + syllables(num % 100) + 2;
  if (num < 1e6)
    return syllables(Math.floor(num / 1e3)) + syllables(num % 1e3) + 2;
  if (num < 1e9)
    return syllables(Math.floor(num / 1e6)) + syllables(num % 1e6) + 2;
  if (num < 1e12)
    return syllables(Math.floor(num / 1e9)) + syllables(num % 1e9) + 2;
  console.log('THAT NUMBER IS TOO BIG');
};

import assert from 'assert';
assert.deepStrictEqual(syllables(100), 3);
assert.deepStrictEqual(syllables(77), 5);
assert.deepStrictEqual(syllables(123), 6);
assert.deepStrictEqual(syllables(777), 9);
assert.deepStrictEqual(syllables(999999), 14);
assert.deepStrictEqual(syllables(777777), 20);
assert.deepStrictEqual(syllables(777777777), 31);
assert.deepStrictEqual(syllables(777777777777), 42);

const verseLength = (num) => 25 + 3 * syllables(num);

const numBottles = 1e8;
const syllablesPerSecond = 5;

let sum = 0;
for (let i = 1; i <= numBottles; i++) sum += verseLength(i);
console.log(
  sum / syllablesPerSecond / 60 / 60 / 24 / 365.25,
  'years to get to',
  numBottles.toLocaleString()
);

console.log(verseLength(777777777), 'syllables');
