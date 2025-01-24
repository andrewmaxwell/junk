const pairs = {
  '(': ')',
  '[': ']',
  '{': '}',
};

function isBalanced(inputString) {
  const stack = [];
  for (const char of inputString) {
    const closer = pairs[char];
    if (closer) stack.push(closer);
    else if (stack.pop() !== char) return false;
  }
  return stack.length === 0;
}

import {Test} from './test.js';
for (const [input, expected] of [
  ['', true],
  ['(())', true],
  ['(()))', false],
  ['(', false],
  ['([]{})', true],
  ['([)]', false],
  ['()()', true],
]) {
  Test.assertDeepEquals(isBalanced(input), expected);
}
