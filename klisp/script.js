'use strict';
console.clear();
import {toAST} from './toAST.js';
import {toJS} from './toJS.js';

const input = document.querySelector('textarea');
input.onkeyup = () => {
  localStorage.klisp = input.value;
  const res = toAST(input.value);
  document.querySelector('pre').innerHTML =
    toJS(res) + '\n\n' + JSON.stringify(res, null, 2);
};
if (localStorage.klisp) {
  input.value = localStorage.klisp;
}
input.onkeyup();
