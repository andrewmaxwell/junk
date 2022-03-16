import {replaceVars} from './replaceVars.js';
import {treeMap} from './utils.js';

const apply = (a, b, debug) => {
  const [firstArg, ...restArgs] = a.args;
  const bWithReplacedVars = replaceVars(b, [a, b]);
  const body = treeMap(
    (node) => (node === firstArg ? bWithReplacedVars : node),
    a.body
  );
  const r = simplify(restArgs.length ? {args: restArgs, body} : body, debug);
  if (debug) console.dir({apply: 'apply', a, b, r}, {depth: Infinity});
  return r;
};

export const simplify = (expr, debug) => {
  if (Array.isArray(expr)) {
    const terms = expr.map((el) => simplify(el, debug));
    const simplified = [terms[0]];

    // go through list of things to apply and apply the ones you can
    for (let i = 1; i < terms.length; i++) {
      const last = simplified[simplified.length - 1];
      if (Array.isArray(last.args)) {
        simplified[simplified.length - 1] = apply(last, terms[i], debug);
      } else {
        simplified.push(terms[i]);
      }
    }

    const r = simplified.length === 1 ? simplify(simplified[0]) : simplified;

    if (debug) {
      console.dir(
        {simplify: 'simplify', before: expr, after: r},
        {depth: Infinity}
      );
    }
    return r;
  }

  if (expr && expr.body) {
    const body = replaceVars(simplify(expr.body, debug), expr.args);
    return body.args
      ? {args: [...expr.args, ...body.args], body: body.body}
      : {...expr, body};
  }

  return expr;
};
