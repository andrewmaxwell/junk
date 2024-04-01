import {Test} from '../misc/test.js';
import {parse} from './parse.js';
import {runAsm} from './runAsm.js';
import {tests} from './tests.js';
import {toAsm} from './toAsm.js';
import {tokenize} from './tokenize.js';

Test.failFast = true;

for (const {input, expected} of tests) {
  try {
    const asm = toAsm(parse(tokenize(input)));
    // console.log(asm.map((line, i) => `${i}: ${line}`).join('\n'));
    Test.assertDeepEquals(runAsm(asm), expected);
  } catch (e) {
    console.log(input);
    throw e;
  }
}
console.log('ALL PASSING');
