const simplify = (poly) => {
  const ob = {};
  poly.replace(/(-?\d*)([a-z]+)/g, (_, coef, vars) => {
    coef = coef === '' || coef === '+' ? 1 : coef === '-' ? -1 : +coef;
    vars = [...vars].sort().join('');
    ob[vars] = (ob[vars] || 0) + coef;
  });
  return Object.entries(ob)
    .filter(([, coef]) => coef)
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(
      ([vars, coef], i) =>
        (i && coef > 0 ? '+' : '') +
        (coef === 1 ? '' : coef === -1 ? '-' : coef) +
        vars
    )
    .join('');
};

// https://www.codewars.com/kata/55f89832ac9a66518f000118/train/javascript

import {Test, it} from './test.js';

Test.failFast = true;

it('Test reduction by equivalence', () => {
  Test.assertEquals(simplify('dc+dcba'), 'cd+abcd');
  Test.assertEquals(simplify('2xy-yx'), 'xy');
  Test.assertEquals(simplify('-a+5ab+3a-c-2a'), '-c+5ab');
});
it('Test monomial length ordering', () => {
  Test.assertEquals(simplify('-abc+3a+2ac'), '3a+2ac-abc');
  Test.assertEquals(simplify('xyz-xz'), '-xz+xyz');
});
it('Test lexicographic ordering', () => {
  Test.assertEquals(simplify('a+ca-ab'), 'a-ab+ac');
  Test.assertEquals(simplify('xzy+zby'), 'byz+xyz');
});
it('Test no leading +', () => {
  Test.assertEquals(simplify('-y+x'), 'x-y');
  Test.assertEquals(simplify('y-x'), '-x+y');
});

Test.assertDeepEquals(simplify('-15cb-12cb-0c+7cb'), '-20bc');
