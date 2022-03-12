import {parse} from './parse.js';
import {simplify} from './simplify.js';

import {replaceVars} from './replaceVars.js';

const exprToString = (expr, wrap) => {
  if (!expr || typeof expr !== 'object') return expr;
  const res = Array.isArray(expr)
    ? expr.map(exprToString).join('')
    : `λ${expr.args.join('')}.${exprToString(expr.body)}`;
  return wrap ? `(${res})` : res;
};

export const evaluate = (str, debug) => {
  try {
    return exprToString(replaceVars(simplify(parse(str), debug)));
  } catch (e) {
    return e.message;
  }
};
