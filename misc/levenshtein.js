const levenshtein = (a, b) => {
  let m = [];
  for (let j = 0; j <= b.length; j++) m[j] = j;
  for (let i = 0; i < a.length; i++) {
    const n = [i + 1];
    for (let j = 0; j < b.length; j++) {
      n[j + 1] = Math.min(m[j] + (b[j] !== a[i]), n[j] + 1, m[j + 1] + 1);
    }
    m = n;
  }
  return m[b.length];
};

import {Test} from './test.js';
Test.assertDeepEquals(levenshtein('abc', 'abc'), 0);
Test.assertDeepEquals(levenshtein('abc', 'abd'), 1);
Test.assertDeepEquals(levenshtein('abc', 'ab'), 1);
Test.assertDeepEquals(levenshtein('abc', 'abcd'), 1);
Test.assertDeepEquals(levenshtein('abc', 'def'), 3);
