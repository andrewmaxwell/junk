'use strict';
console.clear();

import {tokenize} from './tokenize.js';
import {toJS} from './toJS.js';
import {parse} from './parser.js';
import {transform} from './transform.js';
const {pipe} = window.R;

/*

pipe(
  filter(path(['entitlements', 'PGM_SPECIALIST'])),
  pluck('_id')
)
when(gt(10), converge(add, [inc, add(5)]))

*/

const input = document.querySelector('textarea');
if (localStorage.ramdaInput) input.value = localStorage.ramdaInput;

window.compile = input.onkeyup = () => {
  if (!input.value) return;
  localStorage.ramdaInput = input.value;
  try {
    const res = pipe(
      tokenize,
      parse,
      transform
    )(input.value);
    document.querySelector('pre').innerHTML =
      toJS(res) + '\n\n' + JSON.stringify(res, null, 2);
  } catch (e) {
    document.querySelector('pre').innerHTML = e.stack;
    throw e;
  }
};

window.compile();
input.focus();
