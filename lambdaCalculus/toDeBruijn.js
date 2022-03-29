import {nest, treeMap} from './utils.js';

const lambdaDepth = (depth, body) =>
  depth ? ['λ', lambdaDepth(depth - 1, body)] : body;

const parse = (node) => {
  if (!Array.isArray(node)) return node;

  if (node[0] === 'λ' && node.includes('.')) {
    const index = node.indexOf('.');
    const args = node.slice(0, index).filter((t) => t !== 'λ');
    const body = treeMap(
      (t) => (args.includes(t) ? args.length - args.indexOf(t) - 1 : t),
      node.slice(index + 1)
    );
    return lambdaDepth(args.length, body.length > 1 ? body : body[0]);
  }

  // turn [a, b, c, d] into [[[a, b], c], d]
  const n = [...node];
  while (n.length > 2) n.splice(0, 2, [n[0], n[1]]);
  return n;
};

const toDeBruijn = (str) => treeMap(parse, nest(str));

import {Test} from '../misc/test.js';

Test.assertDeepEquals(toDeBruijn('λa.a'), ['λ', 0]);
Test.assertDeepEquals(toDeBruijn('λab.a'), ['λ', ['λ', 1]]);
Test.assertDeepEquals(toDeBruijn('λab.a(a(ab))'), [
  'λ',
  ['λ', [1, [1, [1, 0]]]],
]);

Test.assertDeepEquals(toDeBruijn('(λabc.acb)(λab.a)'), [
  ['λ', ['λ', ['λ', [[2, 0], 1]]]],
  ['λ', ['λ', 1]],
]);

Test.assertDeepEquals(toDeBruijn('(λab.a(λcde.d(cde))b)(λab.ab)(λab.a(ab))'), [
  [
    ['λ', ['λ', [[1, ['λ', ['λ', ['λ', [1, [[2, 1], 0]]]]]], 0]]],
    ['λ', ['λ', [1, 0]]],
  ],
  ['λ', ['λ', [1, [1, 0]]]],
]);
