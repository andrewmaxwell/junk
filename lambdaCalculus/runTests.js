import {Test} from '../misc/test.js';
import {evaluate} from './evaluate.js';
import {tests} from './tests.js';

for (const [input, expected, description] of tests) {
  Test.assertEquals(evaluate(input), expected, description);
}
