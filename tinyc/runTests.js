import assert from 'assert';
import {parse} from './parse.js';
import {runAsm} from './runAsm.js';
import {tests} from './tests.js';
import {toAsm} from './toAsm.js';
import {tokenize} from './tokenize.js';

const run = (input) => runAsm(toAsm(parse(tokenize(input))));

for (const {input, expected} of tests) {
  assert.deepStrictEqual(run(input), expected);
}
console.log('ALL PASSING');
