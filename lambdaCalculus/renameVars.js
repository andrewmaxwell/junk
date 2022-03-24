import {eachNode, treeMap} from './utils.js';

const letters = 'abcdefghijklmnopqrstuvwxyz';

export const renameVars = (expr, parentExpr = []) => {
  const possibleVarSet = new Set(letters);
  eachNode((node) => possibleVarSet.delete(node), parentExpr);
  const availableVars = [...possibleVarSet];

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
