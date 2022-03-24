import {exprToString} from './exprToString.js';
import {renameVars} from './renameVars.js';
import {treeMap} from './utils.js';

const apply = (a, b, argsInScope, steps, depth) => {
  const [firstArg, ...restArgs] = a.args;
  const bWithReplacedVars = renameVars(b, [a, ...argsInScope]);
  const body = treeMap(
    (node) => (node === firstArg ? bWithReplacedVars : node),
    a.body
  );
  // eslint-disable-next-line no-use-before-define
  return simplify(
    restArgs.length ? {args: restArgs, body} : body,
    steps,
    argsInScope,
    depth
  );
};

export const simplify = (expr, steps, argsInScope = [], depth = 0) => {
  if (Array.isArray(expr)) {
    const terms = expr.map((el) => simplify(el, steps, argsInScope, depth + 1));

    while (Array.isArray(terms[0]?.args) && terms.length > 1) {
      const [a, b] = terms;
      steps.push(
        `${' '.repeat(depth)}(${exprToString(a)}) (${exprToString(b)})`
      );
      const applied = apply(a, b, argsInScope, steps, depth + 1);
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
    const body = simplify(
      expr.body,
      steps,
      [...argsInScope, ...expr.args], // pass args down call tree to avoid collisions
      depth + 1
    );
    const result = body.args
      ? {args: [...expr.args, ...body.args], body: body.body}
      : {...expr, body};

    const b = exprToString(result);
    // don't output steps if they are inconsequential
    if (a === b) steps.length = prevStepsLength;
    else steps.push(' '.repeat(depth) + ' => ' + b);
    return result;
  }

  return expr;
};
