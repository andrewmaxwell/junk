'use strict';

import {toJS} from './toJS.js';
import {parse} from './parser.js';
import {transform} from './transform.js';
const {pipe, tap} = window.R;

/*

pipe(
  filter(path(['entitlements', 'PGM_SPECIALIST'])),
  pluck('_id')
)
when(gt(10), converge(add, [inc, add(5)]))

*/

const input = document.querySelector('textarea');
if (localStorage.ramdaInput) input.value = localStorage.ramdaInput;

window.compile = input.oninput = () => {
  if (!input.value) return;
  localStorage.ramdaInput = input.value;
  try {
    const res = pipe(
      parse,
      tap(d => console.log('parsed', JSON.stringify(d, null, 2))),
      transform
    )(input.value);
    document.querySelector('pre').innerHTML =
      toJS(res) + '\n\n' + JSON.stringify(res, null, 2);
  } catch (e) {
    document.querySelector('pre').innerHTML = e.stack;
    throw e;
  }
};

// console.clear();
window.compile();
input.focus();

// console.log(toJS(parse('(p, t, e, d) => p(d) ? t(d) : e(d)')));
