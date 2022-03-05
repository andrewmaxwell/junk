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

const evaluate = (str, lib) =>
  exprToString(simplify(resolvePlaceholders(parseExpr(str), lib)));

const lib = parseLib(`
false = λab.b
true = λab.a
inc = λnfx.f(nfx) 
plus = λmnfx.mf(nfx)
two = λfx.f(fx)
three = λfx.f(f(fx))`);

const tests = [
  ['x', 'x'],
  ['λx.x', 'λx.x'],
  ['(λx.x)y', 'y'],
  ['(λx.x)(λx.x)', 'λa.a'],
  ['$plus $two $three', 'λfx.f(f(f(f(fx))))'],
  //   ['$inc ($inc $three)', 'λfx.f(f(f(f(fx))))'],
];

for (const [input, expected] of tests) {
  Test.assertEquals(evaluate(input, lib), expected);
}
