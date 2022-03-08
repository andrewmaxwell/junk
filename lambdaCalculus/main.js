// https://en.wikipedia.org/wiki/Lambda_calculus
// https://justine.lol/lambda/

import {parseExpr} from './parse.js';

import {simplify} from './simplify.js';
import {Test} from '../misc/test.js';
import {parseLib, resolvePlaceholders} from './resolvePlaceholders.js';

const exprToString = (expr, wrap) => {
  if (!expr || typeof expr !== 'object') return expr;
  const res = Array.isArray(expr)
    ? expr.map(exprToString).join('')
    : `λ${expr.args.join('')}.${exprToString(expr.body)}`;
  return wrap ? `(${res})` : res;
};

const evaluate = (str, lib, debug) =>
  exprToString(simplify(resolvePlaceholders(parseExpr(str), lib), debug));

const lib = parseLib(`
false = λab.b
true = λab.a
succ = λnfx.f(nfx) 

add = λmnfx.mf(nfx)
mult = λnkf.n(kf)
pow = λnk.k(n)

one = λfx.fx
two = λfx.f(fx)
three = λfx.f(f(fx))`);

const tests = [
  ['x', 'x'],
  ['λx.x', 'λx.x'],
  ['(λx.x)y', 'y'],
  ['(λx.x)(λx.x)', 'λa.a'],
  ['$add $two $three', 'λfx.f(f(f(f(fx))))'],
  ['$succ $three', 'λfx.f(f(f(fx)))'],
  ['$mult $two $three', 'λfx.f(f(f(f(f(fx)))))', true],
];

for (const [input, expected, debug] of tests) {
  Test.assertEquals(evaluate(input, lib, debug), expected);
}
