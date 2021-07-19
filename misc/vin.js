const nums = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const mod = '0123456789X';
const checkVin = (vin) =>
  vin.length === 17 &&
  mod[
    vin
      .split('')
      .reduce((sum, c, i) => sum + (isNaN(c) ? nums[c] : c) * weights[i], 0) %
      11
  ] === vin[8];

const {Test} = require('./test');
Test.assertEquals(checkVin('5YJ3E1EA7HF000337'), true);
Test.assertEquals(checkVin('5YJ3E1EAXHF000347'), true);
Test.assertEquals(checkVin('5VGYMVUX7JV764512'), true);
Test.assertEquals(checkVin('7WDMMTDV9TG739741'), false);
Test.assertEquals(checkVin('7JTRH08L5EJ234829'), false);
