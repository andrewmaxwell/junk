// https://www.codewars.com/kata/540d0fdd3b6532e5c3000b5b/train/javascript

const expand = (str) => {
  console.log(str);
  const m = str.match(/^\((-?\d*)?([a-z])([+-]\d+)\)\^(\d+)$/);
  const [, _a, varName, b, exp] = m;
  const a = _a === '-' ? -1 : _a || 1;

  const coefs = [1];
  for (let i = 0; i < exp; i++) {
    coefs.push(1);
    for (let j = coefs.length - 2; j; j--) {
      coefs[j] += coefs[j - 1];
    }
  }

  let result = '';
  for (let i = 0; i < coefs.length; i++) {
    const coef = a ** (exp - i) * b ** i * coefs[i];
    if (!coef) continue;
    if (i && coef > 0) result += '+';
    if (exp == i) result += coef;
    else {
      if (coef === -1) result += '-';
      if (Math.abs(coef) !== 1) result += coef;
      result += varName;
      if (exp - i > 1) result += '^' + (exp - i);
    }
  }
  return result;
};

import {Test} from './test.js';
Test.assertEquals(expand('(x+1)^0'), '1');
Test.assertEquals(expand('(x+1)^1'), 'x+1');
Test.assertEquals(expand('(x+1)^2'), 'x^2+2x+1');

Test.assertEquals(expand('(x-1)^0'), '1');
Test.assertEquals(expand('(x-1)^1'), 'x-1');
Test.assertEquals(expand('(x-1)^2'), 'x^2-2x+1');

Test.assertEquals(expand('(5m+3)^4'), '625m^4+1500m^3+1350m^2+540m+81');
Test.assertEquals(expand('(2x-3)^3'), '8x^3-36x^2+54x-27');
Test.assertEquals(expand('(7x-7)^0'), '1');

Test.assertEquals(expand('(-5m+3)^4'), '625m^4-1500m^3+1350m^2-540m+81');
Test.assertEquals(expand('(-2k-3)^3'), '-8k^3-36k^2-54k-27');
Test.assertEquals(expand('(-7x-7)^0'), '1');
Test.assertDeepEquals(expand('(9t-0)^2'), '81t^2');
Test.assertDeepEquals(
  expand('(-n-12)^5'),
  '-n^5-60n^4-1440n^3-17280n^2-103680n-248832'
);
