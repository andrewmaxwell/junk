function solution(n) {
  if (n === 1) return '1';
  if (n % 3 === 0) {
    const s = solution(n / 3);
    if (s) return `(${s}) * 3`;
  }
  if (n > 5) {
    const s = solution(n - 5);
    if (s) return `(${s}) + 5`;
  }
  return null;
}

import {Test} from './test.js';
Test.assertDeepEquals(solution(1), '1');
Test.assertDeepEquals(solution(3), '(1) * 3');
Test.assertDeepEquals(solution(6), '(1) + 5');

Test.assertDeepEquals(solution(2), null);
Test.assertDeepEquals(solution(12), null);
Test.assertDeepEquals(solution(100), null);

console.log(solution(5610));
