const longestSubstringOf = (s) => {
  let startIndex = 0;
  let lastIndex = {};
  let maxLen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] in lastIndex)
      startIndex = Math.max(startIndex, lastIndex[s[i]] + 1);
    lastIndex[s[i]] = i;
    maxLen = Math.max(maxLen, i - startIndex);
  }
  return maxLen + 1;
};

import {Test} from './test';
Test.assertEquals(
  longestSubstringOf('baacab'),
  3,
  'cab is the longest substring.'
);

Test.assertEquals(
  longestSubstringOf('abcd'),
  4,
  'abcd is the longest substring.'
);

Test.assertEquals(
  longestSubstringOf('hchzvfrkmlnozjk'),
  11,
  'chzvfrkmlno is the longest substring.'
);

Test.assertEquals(
  longestSubstringOf('!@#$%^&^%$#@!'),
  7,
  '!@#$%^& is the longest substring.'
);

Test.assertEquals(
  longestSubstringOf('abcd'.repeat(10000) + 'abcde' + 'abcd'.repeat(10000)),
  5,
  "abcde is the longest substring. Don't try to write a brute force solution ;-)"
);
