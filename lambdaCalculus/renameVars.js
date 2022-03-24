import {eachNode, treeMap} from './utils.js';

const letters = 'abcdefghijklmnopqrstuvwxyz';

const getAvailableVars = (parentExpr) => {
  const possibleVarSet = new Set(letters);
  eachNode((node) => {
    if (typeof node === 'string') possibleVarSet.delete(node);
  }, parentExpr);
  return [...possibleVarSet];
};

export const renameVars = (expr, parentExpr = []) => {
  const availableVars = getAvailableVars(parentExpr); // TODO: what if this list runs out?

  const varMapping = {};
  let counter = 0;

  return treeMap(
    (node, path) =>
      node?.args
        ? {
            ...node,
            args: node.args.map(
              (el) =>
                (varMapping[el] = varMapping[el] || availableVars[counter++])
            ),
          }
        : typeof node === 'string' && !path.includes('args')
        ? varMapping[node] || node
        : node,
    expr
  );
};
