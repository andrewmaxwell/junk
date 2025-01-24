import {bqnToJs} from './main.js';
import {Test} from '../misc/test.js';

const tests = [
  [' 2 +3', '2+3', 'add(2, 3)'],
  ['(2+3)', '2+3', 'add(2, 3)'],
  ['6-   5', '6-5', 'subtract(6, 5)'],
  [' - 1.5', '-1.5', 'subtract(null, 1.5)'],
  ['¯1.5', '-1.5', 'subtract(null, 1.5)'],
  ['2 × π', '2*Math.PI', 'multiply(2, Math.PI)'],
  ['÷ ∞', '1/Infinity', 'divide(null, Infinity)'],
  ['2 ⋆ 3', '2**3', 'power(2, 3)'],
  ['⋆1', 'Math.exp(1)', 'power(null, 1)'],
  ['⋆ 2.3', 'Math.exp(2.3)', 'power(null, 2.3)'],
  ['√ 2', 'Math.sqrt(2)', 'root(null, 2)'],
  ['3 √ 27', '27**(1/3)', 'root(3, 27)'],
  ['2×3 - 5', '2*(3-5)', 'multiply(2, subtract(3, 5))'],
  ['(2×3) - 5', '(2*3)-5', 'subtract(multiply(2, 3), 5)'],
  [
    '(4÷3) × π × 2⋆3',
    '(4/3)*(Math.PI*(2**3))',
    'multiply(divide(4, 3), multiply(Math.PI, power(2, 3)))',
  ],
  [
    '√ 3 + 2 × √2',
    'Math.sqrt(3+2*Math.sqrt(2))',
    'root(null, add(3, multiply(2, root(null, 2))))',
  ],
  ['1 + √2', '1+Math.sqrt(2)', 'add(1, root(null, 2))'],
  [
    '(√3 + 2×√2) - 1+√2',
    'Math.sqrt(3+2*Math.sqrt(2))-(1+Math.sqrt(2))',
    'subtract(root(null, add(3, multiply(2, root(null, 2)))), add(1, root(null, 2)))',
  ],
  ["'c'", "'c'", "'c'"],
  ["'c' + 1", "String.fromCharCode('c'.charCodeAt(0)+1)", "add('c', 1)"],
  ["'h' - 'a'", "'h'.charCodeAt(0)-'a'.charCodeAt(0)", "subtract('h', 'a')"],
  [
    "'K' + 'a'-'A'",
    "String.fromCharCode('K'.charCodeAt(0)+('a'.charCodeAt(0)-'A'.charCodeAt(0)))",
    "add('K', subtract('a', 'A'))",
  ],
  ["'4' - '0'", "'4'.charCodeAt(0)-'0'.charCodeAt(0)", "subtract('4', '0')"],
  ["'*' - @", "'*'.charCodeAt(0)", "subtract('*', '\x00')"],
  ['@ + 97', 'String.fromCharCode(97)', "add('\x00', 97)"],
  [
    "2 -˜ 'd'",
    "String.fromCharCode('d'.charCodeAt(0)-2)",
    "swap(subtract)(2, 'd')",
  ],
  ['+˜ 3', '3+3', 'swap(add)(null, 3)'],
  ['×˜ 5', '5*5', 'swap(multiply)(null, 5)'],
  ['2 ⋆˜ 5', '5**2', 'swap(power)(2, 5)'],
  ['√⁼ 5', '5**2', 'undo(root)(null, 5)'],
  ['⋆⁼ 10', 'Math.log(10)', 'undo(power)(null, 10)'],
  ['2 ⋆⁼ 32', 'Math.log(32)/Math.log(2)', 'undo(power)(2, 32)'],
  [
    '2 ⋆ 2 ⋆⁼ 32',
    '2**(Math.log(32)/Math.log(2))',
    'power(2, undo(power)(2, 32))',
  ],
  ['10 ⋆⁼ 1e4', 'Math.log(1e4)/Math.log(10)', 'undo(power)(10, 1e4)'],
  // ['2 3˙ 4', '3', 'constant(3)(2, 4)'], // this is dumb
  ['3 ×˜∘+ 4', '(3+4)*(3+4)', 'compose(swap(multiply), add)(3, 4)'],
  ['-∘(×˜) 5', '-(5*5)', 'compose(subtract, swap(multiply))(null, 5)'],
];

import {
  add,
  subtract,
  multiply,
  divide,
  power,
  root,
  swap,
  undo,
  compose,
} from './bqnLib.js';

for (const [input, js, expected] of tests) {
  const actual = bqnToJs(input);

  console.log(input);
  Test.assertDeepEquals(actual, expected);

  const jsVal = eval(js);
  const transpiledVal = eval(actual);

  Test.assertDeepEquals(jsVal, transpiledVal);
}
