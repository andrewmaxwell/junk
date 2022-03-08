import {eachNode, treeMap} from './utils.js';

const letters = 'abcdefghijklmnopqrstuvwxyz';

const replaceVars = (expr, parentExpr = []) => {
  const possibleVarSet = new Set(letters);
  eachNode((node) => possibleVarSet.delete(node), parentExpr);
  const availableVars = [...possibleVarSet];

  const varMapping = {};
  let counter = 0;

  return treeMap((node) => {
    if (node?.args) {
      return {
        ...node,
        args: node.args.map(
          (el) => (varMapping[el] = varMapping[el] || availableVars[counter++])
        ),
      };
    }
    return varMapping[node] || node;
  }, expr);
};

const apply = (a, b, debug) => {
  if (!a || !Array.isArray(a.args)) {
    throw new Error(`${JSON.stringify(a)} is not a function.`);
  }

  const [varName, ...rest] = a.args;
  const bWithReplacedVars = replaceVars(b, a);
  const body = simplify(
    treeMap((node) => (node === varName ? bWithReplacedVars : node), a.body),
    debug
  );
  const r = rest.length ? {args: rest, body} : body;
  if (debug) console.dir({apply: 'apply', a, b, r}, {depth: Infinity});
  return r;
};

export const simplify = (expr, debug) => {
  if (!Array.isArray(expr)) return expr;

  const terms = expr.map((el) => simplify(el, debug));
  const simplified = [terms[0]];

  // go through list of things to apply and apply the ones you can
  for (let i = 1; i < terms.length; i++) {
    const last = simplified[simplified.length - 1];
    if (last && Array.isArray(last.args)) {
      simplified[simplified.length - 1] = apply(last, terms[i], debug);
    } else {
      simplified.push(terms[i]);
    }
  }

  const r = simplified.length === 1 ? simplified[0] : simplified;

  if (debug) {
    console.dir(
      {simplify: 'simplify', before: expr, after: r},
      {depth: Infinity}
    );
  }
  return simplified;
};
