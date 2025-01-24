const isMatch = (str, pattern) => {
  let prev = [true];
  for (let j = 0; pattern[j] === '*'; j++) prev[j + 1] = true;

  for (const char of str) {
    const next = [];
    for (let j = 0; j < pattern.length; j++) {
      if (char === pattern[j] || pattern[j] === '?') next[j + 1] = prev[j];
      else if (pattern[j] === '*') next[j + 1] = prev[j + 1] || next[j];
    }
    prev = next;
  }
  return !!prev[pattern.length];
};

import {Test} from './test.js';
Test.assertDeepEquals(isMatch('a', 'a'), true);
Test.assertDeepEquals(isMatch('aa', 'a'), false);
Test.assertDeepEquals(isMatch('aa', 'aa'), true);
Test.assertDeepEquals(isMatch('abc', 'abc'), true);
Test.assertDeepEquals(isMatch('abc', 'abd'), false);

Test.assertDeepEquals(isMatch('a', '?'), true);
Test.assertDeepEquals(isMatch('cb', '?a'), false);
Test.assertDeepEquals(isMatch('cb', '??'), true);
Test.assertDeepEquals(isMatch('', '?'), false);

Test.assertDeepEquals(isMatch('aa', '*'), true);
Test.assertDeepEquals(isMatch('aa', '*a'), true);
Test.assertDeepEquals(isMatch('aa', '*b'), false);
Test.assertDeepEquals(isMatch('aab', '*b*'), true);

Test.assertDeepEquals(
  isMatch('aaabbbaabaaaaababaabaaabbabbbbbbbbaabababbabbbaaaaba', 'a*******b'),
  false
);

Test.assertDeepEquals(
  isMatch(
    'babbbbaabababaabbababaababaabbaabababbaaababbababaaaaaabbabaaaabababbabbababbbaaaababbbabbbbbbbbbbaabbb',
    'b**bb**a**bba*b**a*bbb**aba***babbb*aa****aabb*bbb***a'
  ),
  false
);

Test.assertDeepEquals(
  isMatch(
    'aaaabaaaabbbbaabbbaabbaababbabbaaaababaaabbbbbbaabbbabababbaaabaabaaaaaabbaabbbbaababbababaabbbaababbbba',
    '*****b*aba***babaa*bbaba***a*aaba*b*aa**a*b**ba***a*a*'
  ),
  true
);
