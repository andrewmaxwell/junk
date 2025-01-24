function diff(lhs, rhs, path = ['value']) {
  if (lhs === rhs) return [];
  if (lhs && rhs && typeof lhs === 'object' && typeof rhs === 'object') {
    return Object.keys({...lhs, ...rhs})
      .flatMap((key) => diff(lhs[key], rhs[key], [...path, key]))
      .join(', ');
  }

  return (
    path.join('.').replace(/\.(\d+)/g, '[$1]') +
    ' changed from ' +
    JSON.stringify(lhs) +
    ' to ' +
    JSON.stringify(rhs)
  );
}

import {Test} from './test.js';

Test.assertEquals(diff('a', 'b'), 'value changed from "a" to "b"');
Test.assertEquals(diff({x: 5}, {x: 6}), 'value.x changed from 5 to 6');
Test.assertEquals(diff({}, {x: 0}), 'value.x changed from undefined to 0');
Test.assertEquals(diff({}, {}), '');
Test.assertEquals(
  diff({x: 'hi'}, {}),
  'value.x changed from "hi" to undefined'
);
Test.assertEquals(
  diff({x: 1, y: 2}, {x: 3, y: 4}),
  'value.x changed from 1 to 3, value.y changed from 2 to 4'
);
Test.assertEquals(
  diff({x: {y: 2}}, {x: {y: 3}}),
  'value.x.y changed from 2 to 3'
);
Test.assertEquals(
  diff({x: true}, {y: false}),
  'value.x changed from true to undefined, value.y changed from undefined to false'
);
Test.assertEquals(
  diff({k: [1, 2, 3]}, {k: [1, 2, 4]}),
  'value.k[2] changed from 3 to 4'
);
Test.assertEquals(
  diff({a: {c: 5, d: [1, 2, 3]}}, {a: {c: 6, d: [1, 2, {e: 3}]}}),
  'value.a.c changed from 5 to 6, value.a.d[2] changed from 3 to {"e":3}'
);
Test.assertEquals(diff([1, 2, 3], [1, 2, 3]), '');
Test.assertEquals(
  diff([[[[[6]]]]], [[[[[8]]], 'banana']]),
  'value[0][0][0][0][0] changed from 6 to 8, value[0][1] changed from undefined to "banana"'
);
Test.assertDeepEquals(diff({0: 'a', 1: 'b'}, ['a', 'b']), '');
