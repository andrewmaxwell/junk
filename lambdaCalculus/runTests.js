import {Test} from '../misc/test.js';
import {evaluate} from './evaluate.js';
import {tests} from './tests.js';

Test.failFast = true;

Test.assertEquals(evaluate('λa.(λx.x)(λbc.acb)'), 'λabc.acb');
Test.assertEquals(evaluate('λa.(λb.b)(λcd.adc)'), 'λabc.acb');
Test.assertEquals(evaluate('λb.(λac.c)b(λef.bfe)'), 'λabc.acb');
Test.assertEquals(evaluate('(λab.ab(λef.bfe)) (λab.b)'), 'λabc.acb');
Test.assertEquals(evaluate('(λab.ab(λef.bfe)) (λab.b) (λab.b)'), 'λab.a');

for (const [description, input, expected] of tests) {
  Test.assertEquals(evaluate(input), expected, description);
}

// Test.assertEquals(evaluate(`(λab.ab((λabc.acb) b)) (λab.b) (λab.b)`), 'λab.a'); // doesn't pass because of argument collisions
