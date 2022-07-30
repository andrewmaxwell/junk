const balancedParens = (left, right = 0, str = '') => [
  ...(left ? balancedParens(left - 1, right + 1, str + '(') : []),
  ...(right ? balancedParens(left, right - 1, str + ')') : []),
  ...(left || right ? [] : [str]),
];

import {Test} from './test.js';
Test.assertDeepEquals(balancedParens(0).sort(), ['']);
Test.assertDeepEquals(balancedParens(1).sort(), ['()']);
Test.assertDeepEquals(balancedParens(2).sort(), ['(())', '()()']);
Test.assertDeepEquals(balancedParens(3).sort(), [
  '((()))',
  '(()())',
  '(())()',
  '()(())',
  '()()()',
]);
Test.assertDeepEquals(balancedParens(4).sort(), [
  '(((())))',
  '((()()))',
  '((())())',
  '((()))()',
  '(()(()))',
  '(()()())',
  '(()())()',
  '(())(())',
  '(())()()',
  '()((()))',
  '()(()())',
  '()(())()',
  '()()(())',
  '()()()()',
]);
