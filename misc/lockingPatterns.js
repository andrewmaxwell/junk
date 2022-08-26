const letters = {
  A: 'BDEFH',
  B: 'ACDEFGI',
  C: 'BDEFH',
  D: 'ABCEGHI',
  E: 'ABCDFGHI',
  F: 'ABCEGHI',
  G: 'BDEFH',
  H: 'ACDEFGI',
  I: 'BDEFH',
};

const jumps = {
  A: ['BC', 'EI', 'DG'],
  B: ['EH'],
  C: ['BA', 'EG', 'FI'],
  D: ['EF'],
  E: [],
  F: ['ED'],
  G: ['DA', 'EC', 'HI'],
  H: ['EB'],
  I: ['EA', 'FC', 'HG'],
};

const countPatternsFrom = (str, length) => {
  if (length === 0 || length > 9) return 0;
  if (str.length === length) return 1;
  let total = 0;
  const last = str[str.length - 1];
  for (const t of letters[last]) {
    if (!str.includes(t)) {
      total += countPatternsFrom(str + t, length);
    }
  }
  for (const [b, t] of jumps[last]) {
    if (str.includes(b) && !str.includes(t)) {
      total += countPatternsFrom(str + t, length);
    }
  }
  return total;
};

import {Test} from './test.js';
Test.assertEquals(countPatternsFrom('A', 0), 0);
Test.assertEquals(countPatternsFrom('A', 10), 0);
Test.assertEquals(countPatternsFrom('B', 1), 1);
Test.assertEquals(countPatternsFrom('C', 2), 5);
Test.assertEquals(countPatternsFrom('D', 3), 37);
Test.assertEquals(countPatternsFrom('E', 4), 256);
Test.assertEquals(countPatternsFrom('E', 8), 23280);
