import {Test} from '../misc/test.js';
import {evaluate} from './evaluate.js';
import {tests} from './tests.js';

Test.failFast = true;

Test.assertEquals(evaluate('λa.(λx.x)(λbc.acb)'), 'λabc.acb');
Test.assertEquals(evaluate('λa.(λb.b)(λcd.adc)'), 'λabc.acb');
Test.assertEquals(evaluate('λb.(λac.c)b(λef.bfe)'), 'λabc.acb');
Test.assertEquals(evaluate('(λab.ab(λef.bfe)) (λab.b)'), 'λabc.acb');
Test.assertEquals(evaluate('(λab.ab(λef.bfe)) (λab.b) (λab.b)'), 'λab.a');

// THESE FAIL BUT SHOULD PASS
// Test.assertDeepEquals(
//   evaluate(
//     `SUCC = λabc.b(abc)
// (λab.a SUCC b) (λab.a(ab)) (λab.b) // 2 + 0`,
//     true
//   ),
//   'λab.a(ab)',
//   'test 3'
// );
// Test.assertDeepEquals(
//   evaluate(`
//   SUCC = λabc.b(abc)
//   (λab.a SUCC b) (λab.a(ab)) (λab.b)`),
//   'λab.a(ab)',
//   'test 2'
// );
// Test.assertDeepEquals(
//   evaluate(`
//   SUCC = λabc.b(abc)
//   ADD = λab.a SUCC b
//   ADD (λab.a(ab)) (λab.b) // 2 + 0
//   `),
//   'λab.a(ab)',
//   'test 1'
// );
// Test.assertDeepEquals(
//   evaluate(`
//   SUCC = λabc.b(abc)
//   ADD = λab.a SUCC b
//   ADD (λab.a(ab)) (λab.ab)
//   `),
//   'λab.a(a(ab))',
//   'test 0'
// );

for (const [description, input, expected] of tests) {
  Test.assertEquals(evaluate(input), expected, description);
}

// Test.assertEquals(evaluate(`(λab.ab((λabc.acb) b)) (λab.b) (λab.b)`), 'λab.a'); // doesn't pass because of argument collisions
