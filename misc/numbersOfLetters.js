const nums = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];

function numbersOfLetters(integer) {
  const str = [...integer.toString()].map((d) => nums[d]).join('');
  return [str, ...(integer === 4 ? [] : numbersOfLetters(str.length))];
}

import {Test} from './test.js';
Test.assertDeepEquals(numbersOfLetters(1), ['one', 'three', 'five', 'four']);
Test.assertDeepEquals(numbersOfLetters(12), [
  'onetwo',
  'six',
  'three',
  'five',
  'four',
]);
Test.assertDeepEquals(numbersOfLetters(37), [
  'threeseven',
  'onezero',
  'seven',
  'five',
  'four',
]);
Test.assertDeepEquals(numbersOfLetters(311), [
  'threeoneone',
  'oneone',
  'six',
  'three',
  'five',
  'four',
]);
Test.assertDeepEquals(numbersOfLetters(999), [
  'nineninenine',
  'onetwo',
  'six',
  'three',
  'five',
  'four',
]);
