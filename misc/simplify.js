const precedence = {'-': 2, '+': 1};

const parse = (str) => {
  let depth = 0;
  let opIdx;
  for (let i = str.length - 1; i >= 0; i--) {
    const c = str[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (
      !depth &&
      precedence[c] &&
      (opIdx === undefined || precedence[c] < precedence[str[opIdx]])
    ) {
      opIdx = i;
    }
  }

  // parse infix operators
  if (opIdx >= 0) {
    return {
      op: str[opIdx],
      a: parse(str.slice(0, opIdx)),
      b: parse(str.slice(opIdx + 1)),
    };
  }

  if (str[0] === '(') return parse(str.slice(1, -1)); // remove parens

  // parse things like 20(f)
  const match = str.match(/^(\d+)(.*)$/);
  if (match) return {op: '*', a: +match[1], b: parse(match[2])};

  // parse empty string (before -, parsed as 0), or vars without coefficients
  return {coef: str ? 1 : 0, val: str};
};

const doSubstitutions = (formula, replacements) =>
  formula.op
    ? {
        ...formula,
        a: doSubstitutions(formula.a, replacements),
        b: doSubstitutions(formula.b, replacements),
      }
    : replacements[formula.val]
    ? {
        op: '*',
        a: formula.coef,
        b: doSubstitutions(replacements[formula.val], replacements),
      }
    : formula;

const mult = (num, expr) => {
  if (expr.op) {
    const {op, a, b} = expr;
    if (op === '*') return {op: '*', a: a * num, b};
    return {op, a: mult(num, a), b: mult(num, b)};
  }
  return {...expr, coef: expr.coef * num};
};

const simplifyExpr = (expr) => {
  if (!expr.op) return expr;
  const a = simplifyExpr(expr.a);
  const b = simplifyExpr(expr.b);
  return expr.op === '*'
    ? mult(a, b)
    : {...b, coef: a.coef + b.coef * (expr.op === '-' ? -1 : 1)};
};

const simplify = (equalities, formula) => {
  const replacements = {};
  for (const s of equalities) {
    const [left, right] = s.replace(/ /g, '').split('=');
    replacements[right] = parse(left);
  }
  const parsed = parse(formula.replace(/ /g, ''));
  const {coef, val} = simplifyExpr(doSubstitutions(parsed, replacements));
  return coef + val;
};

import {Test} from './test.js';
Test.failFast = true;

Test.assertEquals(
  simplify(['a + a = b', 'b - d = c', 'a + b = d'], 'c + a + b'),
  '2a'
);
Test.assertEquals(simplify(['a + 3g = k', '-70a = g'], '-k + a'), '210a');

Test.assertEquals(simplify(['-j -j -j + j = b'], '-j - b'), '1j');
Test.assertEquals(
  simplify(
    ['(-3f + q) + r = l', '4f + q = r', '-10f = q'],
    '20l + 20(q - 200f)'
  ),
  '-4580f'
);
Test.assertEquals(
  simplify(['-(-(-(-(-(g))))) - l  = h', '8l = g'], 'h - l - g'),
  '-18l'
);
Test.assertEquals(simplify(['x = b', 'b = c', 'c = d', 'd = e'], 'c'), '1x');
Test.assertEquals(
  simplify(
    [
      'y + 6Y - k - 6 K = f',
      ' F + k + Y - y = K',
      'Y = k',
      'y = Y',
      'y + Y = F',
    ],
    'k - f + y'
  ),
  '14y'
);
