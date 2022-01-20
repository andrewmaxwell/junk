// nodemon lisp/runTests.js

import {execute} from './execute.js';
import {parse} from './parse.js';
import {tests} from './tests.js';
import {Test} from '../misc/test.js';

const exec = (str) => {
  try {
    return execute(parse(str));
  } catch (e) {
    return e.message;
  }
};

for (const [input, expected, desc = ''] of tests) {
  Test.assertDeepEquals(exec(input), expected, desc);
}
