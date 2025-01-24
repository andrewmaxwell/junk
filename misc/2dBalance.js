const isLineBalanced = (pairs) => (str) => {
  const inversePairs = {};
  for (const c in pairs) inversePairs[pairs[c]] = c;

  const counts = {};
  for (const c of str) {
    if (pairs[c]) counts[c] = (counts[c] || 0) + 1;
    else if (inversePairs[c]) {
      if (!counts[inversePairs[c]]) return false;
      counts[inversePairs[c]]--;
    }
  }

  return Object.values(counts).every((c) => !c);
};

const isBalanced = (str) => {
  const rows = str.split('\n');
  const cols = rows[0].split('').map((_, i) => rows.map((r) => r[i]));
  return (
    (cols.length === 1 ||
      rows.every(isLineBalanced({'(': ')', '[': ']', '{': '}', '<': '>'}))) &&
    (rows.length === 1 ||
      cols.every(isLineBalanced({M: 'W', m: 'w', n: 'u', '^': 'v'})))
  );
};

import {Test} from './test.js';

Test.assertEquals(isBalanced(`(abc)`), true);

Test.assertEquals(isBalanced(`(.{.[.].}.)`), true);

Test.assertEquals(
  isBalanced(`(.^.)
[{.}]
<.v.>`),
  true
);

Test.assertEquals(
  isBalanced(`mnm
<o>
wuw`),
  true
);

Test.assertEquals(isBalanced(`([{)]}`), true);

Test.assertEquals(
  isBalanced(`<<>>
[^^]
.vv.
{[]}`),
  true
);

Test.assertEquals(
  isBalanced(`mmmm
mmmm
wwww
wwww`),
  true
);

Test.assertEquals(
  isBalanced(`({...}
......
[...])`),
  false
);
Test.assertEquals(
  isBalanced(`(n^m
.uvw
...)`),
  false
);
Test.assertEquals(
  isBalanced(`({...}
......
[...])`),
  false
);
Test.assertEquals(isBalanced(`())`), false);
Test.assertEquals(isBalanced(`(()`), false);
Test.assertEquals(isBalanced(`(])[`), false);
Test.assertEquals(
  isBalanced(`(...
)`),
  false
);
