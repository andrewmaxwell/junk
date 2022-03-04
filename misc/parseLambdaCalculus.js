const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === '[') indexes.push(result.length);
    else if (t === ']') {
      if (!indexes.length) throw new Error('Unexpected ]');
      result.push(result.splice(indexes.pop()));
    } else result.push(isNaN(t) ? t : Number(t));
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} ]`);
  return result;
};

const parseLambda = (node) => {
  if (!Array.isArray(node)) return node;
  const res = [];
  for (let i = node.length - 1; i >= 0; i--) {
    res.push(node[i] === 'λ' ? ['λ', res.pop()] : parseLambda(node[i]));
  }
  return res.length === 1 ? res[0] : res.reverse();
};

const parseExpr = (str) => parseLambda(nest(str.match(/λ|\d+|\[|\]|\$\w+/g)));

const parseDefinitions = (str) =>
  str
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .reduce((res, line) => {
      const [key, code] = line.trim().replace(/"/g, '').split('=');
      return {...res, [key]: parseExpr(code)};
    }, {});

const stdlib = parseDefinitions(`
nil="λλ 0"
false="λλ 0"
true="λλ 1"
if="λ 0"
omega="λ [0 0]"
pair="λλλ [[0 2] 1]"
car="λ [0 $true]"
cdr="λ [0 $false]"
or="λλ [[0 0] 1]"
and="λλ [[0 1] 0]"
not="λλλ [[2 0] 1]"
xor="λλ [[1 λλ [[2 0] 1]] 0]"
bitxor="λλ [[1 0] λλ [[2 0] 1]]"
iszero="λλλ [[2 λ 1] 1]"
Y="λ [λ [0 0] λ [1 [0 0]]]"

zero="λλ 0"
one="λλ [1 0]"
two="λλ [1 [1 0]]"
three="λλ [1 [1 [1 0]]]"
four="λλ [1 [1 [1 [1 0]]]]"
five="λλ [1 [1 [1 [1 [1 0]]]]]"
six="λλ [1 [1 [1 [1 [1 [1 0]]]]]]"
seven="λλ [1 [1 [1 [1 [1 [1 [1 0]]]]]]]"
eight="λλ [1 [1 [1 [1 [1 [1 [1 [1 0]]]]]]]]"
nine="λλ [1 [1 [1 [1 [1 [1 [1 [1 [1 0]]]]]]]]]"

pow="λλ [0 1]"
mul="λλλ [2 [1 0]]"
dec="λλλ [[[2 λλ [0 [1 3]]] λ 1] λ 0]"
sub="λλ [[0 $dec] 1]"
inc="λλλ [1 [[2 1] 0]]"
add="λλλλ [[3 1] [[2 1] 0]]"
fac="λλ [[[1 λλ [0 [1 λλ [[2 1] [1 0]]]]] λ1] λ0]"
min="λλλλ [[[3 λλ [0 1]] λ1] [[2 λλ [3 [0 1]]] λ1]]"
div="λλλλ [[[3 λλ [0 1]] λ 1] [[3 λ [[[3 λλ [0 1]] λ [3 [0 1]]] λ0]] 0]]"
mod="λλλλ [[[3 $cdr] [[3 λ [[[3 λλλ [[0 [2 [5 1]]] 1]] λ1] 1]] λ1]] λλ0]"

eq="λλ [[[[1 λ [[0 λ0] λ0]] [[0 λλλ [1 2]] λλ0]] λλλ0] λλ1]"
le="λλ [[[1 λλ [0 1]] λλλ1] [[0 λλ [0 1]] λλλ0]]"
lt="λλ [[[0 λλ [0 1]] λλλ0] [[1 λλ [0 1]] λλλ1]]"
odd="λ [$omega λλ [[0 λλ 1] λ [[0 λλ 0] [2 2]]]]"
divides="λλ [[[1 $cdr] [$omega λ[[[1 λλλ [[0 [2 λλ0]] 1]] λ[1 1]] λλ1]]] λλ0]"
`);

console.dir(stdlib, {depth: 5});

import {Test} from './test.js';
Test.assertEquals(parseExpr('λλ0'), ['λ', ['λ', 0]]);
Test.assertEquals(parseExpr('λλ [1 0]'), ['λ', ['λ', [1, 0]]]);
Test.assertEquals(parseExpr('λλλλ [[3 1] [[2 1] 0]]'), [
  'λ',
  [
    'λ',
    [
      'λ',
      [
        'λ',
        [
          [3, 1],
          [[2, 1], 0],
        ],
      ],
    ],
  ],
]);
Test.assertEquals(parseExpr('λλ [1 [1 [1 0]]]'), [
  'λ',
  ['λ', [1, [1, [1, 0]]]],
]);
Test.assertDeepEquals(parseExpr('λλ [[1 λλ [[2 0] 1]] 0]'), [
  'λ',
  ['λ', [[1, ['λ', ['λ', [[2, 0], 1]]]], 0]],
]);
Test.assertDeepEquals(parseExpr('λ[λ0λ0]'), [
  'λ',
  [
    ['λ', 0],
    ['λ', 0],
  ],
]);
Test.assertDeepEquals(parseExpr('λ [λ [0 0] λ [1 [0 0]]]'), [
  'λ',
  [
    ['λ', [0, 0]],
    ['λ', [1, [0, 0]]],
  ],
]);
