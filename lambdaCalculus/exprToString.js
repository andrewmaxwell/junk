export const exprToString = (expr, wrap) => {
  if (!expr || typeof expr !== 'object') return expr;
  const res = Array.isArray(expr)
    ? expr.map((el) => exprToString(el, true)).join('')
    : `λ${expr.args.join('')}.${exprToString(expr.body)}`;
  return wrap ? `(${res})` : res;
};
