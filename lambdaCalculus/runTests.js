import {Test} from '../misc/test.js';
import {evaluate} from './evaluate.js';
import {tests} from './tests.js';

Test.failFast = true;

const run = (input) => evaluate(input).result;

Test.assertEquals(run('λa.(λx.x)(λbc.acb)', true), 'λabc.acb');
Test.assertEquals(run('λa.(λb.b)(λcd.adc)'), 'λabc.acb');
Test.assertEquals(run('λb.(λac.c)b(λef.bfe)'), 'λabc.acb');
Test.assertEquals(run('(λab.ab(λef.bfe)) (λab.b)'), 'λabc.acb');
Test.assertEquals(run('(λab.ab(λef.bfe)) (λab.b) (λab.b)'), 'λab.a');

Test.assertDeepEquals(
  run(
    `SUCC = λabc.b(abc)
ADD = λab.a SUCC b
ONE = λab.ab
TWO = λab.a(ab)
ADD ONE ONE`,
    true
  ),
  'TWO',
  'test 3'
);
Test.assertDeepEquals(
  run(`
  SUCC = λabc.b(abc)
  (λab.a SUCC b) (λab.a(ab)) (λab.b)`),
  'λab.a(ab)',
  'test 2'
);
Test.assertDeepEquals(
  run(`
  SUCC = λabc.b(abc)
  ADD = λab.a SUCC b
  ADD (λab.a(ab)) (λab.b) // 2 + 0
  `),
  'λab.a(ab)',
  'test 1'
);
Test.assertDeepEquals(
  run(`
  SUCC = λabc.b(abc)
  ADD = λab.a SUCC b
  ADD (λab.a(ab)) (λab.ab)
  `),
  'λab.a(a(ab))',
  'test 0'
);

for (const [description, input, expected] of tests) {
  Test.assertEquals(run(input), expected, description);
}
