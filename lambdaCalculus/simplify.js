import {exprToString} from './parse.js';
import {renameVars} from './renameVars.js';
import {treeMap} from './utils.js';

const apply = (a, b, steps, depth) => {
  const [firstArg, ...restArgs] = a.args;
  const bWithReplacedVars = renameVars(b, [a, b]);
  const body = treeMap(
    (node) => (node === firstArg ? bWithReplacedVars : node),
    a.body
  );
  const r = simplify(
    restArgs.length ? {args: restArgs, body} : body,
    steps,
    depth + 1
  );
  return r;
};

export const simplify = (expr, steps, depth = 0) => {
  if (Array.isArray(expr)) {
    const terms = expr.map((el) => simplify(el, steps, depth + 1));

    while (Array.isArray(terms[0]?.args) && terms.length > 1) {
      const [a, b] = terms;
      steps.push(
        `${' '.repeat(depth)}(${exprToString(a)}) (${exprToString(b)})`
      );
      const applied = apply(a, b, steps, depth + 1);
      steps.push(`${' '.repeat(depth)} => ${exprToString(applied)}`);
      // replace first two elements with the application of the first to the second
      terms.splice(0, 2, applied);
    }

    return terms.length === 1 ? terms[0] : terms;
  }

  if (expr && expr.body) {
    const a = exprToString(expr);
    const prevStepsLength = steps.length;
    steps.push(' '.repeat(depth) + a);
    const body = renameVars(simplify(expr.body, steps, depth + 1), expr.args);
    const r = body.args
      ? {args: [...expr.args, ...body.args], body: body.body}
      : {...expr, body};

    const b = exprToString(r);
    if (a === b) {
      steps.length = prevStepsLength;
    } else {
      steps.push(' '.repeat(depth) + ' => ' + b);
    }

    return r;
  }

  return expr;
};
