import {Test} from '../misc/test.js';
import {parse} from './parse.js';
import {runAsm} from './runAsm.js';
import {tests} from './tests.js';
import {toAsm} from './toAsm.js';
import {tokenize} from './tokenize.js';

Test.failFast = true;

for (const {input, expected, ast, asm} of tests) {
  const actualAst = parse(tokenize(input));
  Test.assertDeepEquals(actualAst, ast);

  const actualAsm = toAsm(actualAst);
  Test.assertDeepEquals(actualAsm, asm);

  Test.assertDeepEquals(runAsm(actualAsm), expected);
}
