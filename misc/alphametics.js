const getCoefs = (str, letters) => {
  const [left, right] = str.replace(/\s+/g, '').split('=');
  const indexes = {};
  letters.forEach((t, i) => (indexes[t] = i));
  const coeffs = letters.map(() => 0);
  for (const [word, sign] of [
    ...left.split('+').map((w) => [w, 1]),
    [right, -1],
  ]) {
    for (let i = 0; i < word.length; i++) {
      coeffs[indexes[word[i]]] += sign * 10 ** (word.length - i - 1);
    }
  }
  return coeffs;
};

function alphametics(str) {
  const words = str.match(/[A-Z]+/g);
  const letters = [...new Set(words.join(''))];
  const leadingLetters = new Set(words.map((word) => word[0]));
  const coeffs = getCoefs(str, letters);

  const usedDigits = new Array(10).fill(false);
  const solution = new Array(letters.length);

  function recursiveAssign(index) {
    if (index === letters.length) {
      return !coeffs.reduce((sum, c, i) => sum + c * solution[i], 0);
    }

    for (let d = 0; d < 10; d++) {
      if (usedDigits[d] || (!d && leadingLetters.has(letters[index]))) continue;
      usedDigits[d] = true;
      solution[index] = d;
      if (recursiveAssign(index + 1)) return true;
      usedDigits[d] = false;
    }
  }

  recursiveAssign(0);

  const mapping = {};
  for (let i = 0; i < letters.length; i++) {
    mapping[letters[i]] = solution[i];
  }
  return str.replace(/\w/g, (m) => mapping[m]);
}

// https://www.codewars.com/kata/5b5fe164b88263ad3d00250b/train/javascript

import {Test} from './test.js';
const example_tests = [
  ['SEND + MORE = MONEY', '9567 + 1085 = 10652'],
  ['ZEROES + ONES = BINARY', '698392 + 3192 = 701584'],
  ['COUPLE + COUPLE = QUARTET', '653924 + 653924 = 1307848'],
  ['DO + YOU + FEEL = LUCKY', '57 + 870 + 9441 = 10368'],
  [
    'ELEVEN + NINE + FIVE + FIVE = THIRTY',
    '797275 + 5057 + 4027 + 4027 = 810386',
  ],
  [
    'XOXUU + NPJYOXX + NTPXYOX + FNTTFJ + BBOX + XUXXY = JOJNXTPJ',
    '37322 + 8019733 + 8403973 + 684461 + 5573 + 32339 = 17183401',
  ],
  ['SAND + SUN + SEX + SEA = IBIZA', '7823 + 792 + 765 + 768 = 10148'],
];
console.time();
example_tests.forEach(([s, user]) => Test.assertEquals(alphametics(s), user));
console.timeEnd();

// const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// function* generatePermutations(arr) {
//   yield arr.slice();
//   const c = arr.map(() => 0);
//   for (let i = 0; i < arr.length; ) {
//     if (c[i] >= i) {
//       c[i++] = 0;
//       continue;
//     }
//     const swapIndex = i % 2 ? c[i] : 0;
//     [arr[i], arr[swapIndex]] = [arr[swapIndex], arr[i]];
//     yield arr.slice();
//     c[i]++;
//     i = 0;
//   }
// }

// const getTermVal = (term, mapping) => {
//   let total = 0;
//   for (const t of term) total = total * 10 + mapping[t];
//   return total;
// };

// const alphametics = (str) => {
//   const terms = str.match(/\w+/g);
//   const letters = [...new Set(terms.join(''))];
//   for (const perm of generatePermutations(digits)) {
//     const mapping = {};
//     for (let i = 0; i < letters.length; i++) mapping[letters[i]] = perm[i];

//     if (terms.some((t) => !mapping[t[0]])) continue; // no leading 0s

//     const termVals = terms.map((term) => getTermVal(term, mapping));
//     if (!termVals.reduceRight((a, b) => a - b)) {
//       return str.replace(/\w/g, (x) => mapping[x]);
//     }
//   }
// };
