import {nest, treeMap} from './utils.js';
import {Test} from '../misc/test.js';

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

Test.assertDeepEquals(toDeBruijn('(λa.a)(λx.x)'), [
  ['λ', 0],
  ['λ', 0],
]);

////////////////

const letters = 'abcdefghijklmnopqrstuvwxyz';
const fromDeBruijn = (expr, depth = 0, parent, wrap) => {
  if (typeof expr === 'number') return letters[depth - expr - 1];
  const result =
    expr[0] === 'λ'
      ? (parent?.[0] === 'λ' ? '' : 'λ') +
        letters[depth] +
        (expr[1]?.[0] === 'λ' ? '' : '.') +
        fromDeBruijn(expr[1], depth + 1, expr)
      : fromDeBruijn(expr[0], depth, expr, true) +
        fromDeBruijn(expr[1], depth, expr, true);
  return wrap ? '(' + result + ')' : result;
};

Test.assertDeepEquals(fromDeBruijn(['λ', 0]), 'λa.a');
Test.assertDeepEquals(fromDeBruijn(['λ', ['λ', 1]]), 'λab.a');
Test.assertDeepEquals(
  fromDeBruijn(['λ', ['λ', [1, [1, [1, 0]]]]]),
  'λab.a(a(ab))'
);
Test.assertDeepEquals(
  fromDeBruijn([
    ['λ', ['λ', ['λ', [[2, 0], 1]]]],
    ['λ', ['λ', 1]],
  ]),
  '(λabc.(ac)b)(λab.a)'
);
Test.assertDeepEquals(
  fromDeBruijn([
    [
      ['λ', ['λ', [[1, ['λ', ['λ', ['λ', [1, [[2, 1], 0]]]]]], 0]]],
      ['λ', ['λ', [1, 0]]],
    ],
    ['λ', ['λ', [1, [1, 0]]]],
  ]),
  '((λab.(a(λcde.d((cd)e)))b)(λab.ab))(λab.a(ab))'
);

Test.assertDeepEquals(
  fromDeBruijn([
    ['λ', 0],
    ['λ', 0],
  ]),
  '(λa.a)(λa.a)'
);

///////

const apply = (expr, arg, depth = 0) => {
  if (Array.isArray(expr)) {
    return expr[0] === 'λ'
      ? simplify(['λ', apply(expr[1], arg, depth + 1)])
      : expr.map((x) => apply(x, arg, depth));
  }
  return depth === expr ? arg : expr;
};

const simplify = (expr) => {
  if (!Array.isArray(expr)) return expr;
  const s = expr.map((x) => simplify(x));
  return Array.isArray(s[0]) && s[0][0] === 'λ' ? apply(s[0][1], s[1]) : s;
};

Test.assertDeepEquals(
  simplify([
    ['λ', 0],
    ['λ', 0],
  ]),
  ['λ', 0]
);

Test.assertDeepEquals(
  simplify(toDeBruijn('(λabc.acb)(λab.a)')),
  toDeBruijn('λab.b')
);

Test.assertDeepEquals(
  simplify(toDeBruijn('(λabc.b(abc))(λab.ab)')),
  toDeBruijn('λbc.b(bc)')
);
