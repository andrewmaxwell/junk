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

const apply = (a, b) => {
  if (!a || typeof a !== 'object') {
    throw new Error(`${JSON.stringify(a)} is not a function.`);
  }

  const [varName, ...rest] = a.args;
  const bWithReplacedVars = replaceVars(b, a);
  const body = simplify(
    treeMap((node) => (node === varName ? bWithReplacedVars : node), a.body)
  );
  const r = rest.length ? {args: rest, body} : body;
  console.dir({apply: 'apply', a, b, r}, {depth: Infinity});
  return r;
};

export const simplify = (expr) => {
  if (Array.isArray(expr)) {
    const terms = expr.map(simplify);
    const indexOfUnresolved = terms.findIndex(
      (n) => !n || typeof n !== 'object'
    );

    const r =
      indexOfUnresolved === 0
        ? terms
        : indexOfUnresolved > 0
        ? [
            terms.slice(0, indexOfUnresolved + 1).reduce(apply),
            ...terms.slice(indexOfUnresolved + 1),
          ]
        : terms.reduce(apply);
    console.dir(
      {simplify: 'simplify', before: expr, after: r, indexOfUnresolved},
      {depth: Infinity}
    );
    return r;
  }

  if (expr && typeof expr === 'object') {
    return {...expr, body: simplify(expr.body)};
  }

  return expr;
};
