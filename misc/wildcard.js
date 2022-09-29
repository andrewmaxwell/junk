const isMatchRec = (input, pattern) => {
  if (pattern[0] === '*') {
    return (
      isMatchRec(input, pattern.slice(1)) ||
      (input.length > 0 && isMatchRec(input.slice(1), pattern))
    );
  }
  return (
    input === pattern ||
    ((input[0] === pattern[0] || (pattern[0] === '?' && input.length > 0)) &&
      isMatchRec(input.slice(1), pattern.slice(1)))
  );
};

const isMatch = (input, pattern) => {
  if (pattern.includes('*')) {
    pattern = pattern.replace(/\*+/g, '*');
    const patternEnd = pattern.match(/[^*]*$/)[0];
    if (patternEnd && !isMatchRec(input.slice(-patternEnd.length), patternEnd))
      return false;
  }
  return isMatchRec(input, pattern.replace(/\*+/g, '*'));
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
