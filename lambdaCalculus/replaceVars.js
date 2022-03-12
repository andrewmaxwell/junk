import {eachNode, treeMap} from './utils.js';

const letters = 'abcdefghijklmnopqrstuvwxyz';

export const replaceVars = (expr, parentExpr = []) => {
  const possibleVarSet = new Set(letters);
  eachNode((node) => possibleVarSet.delete(node), parentExpr);
  const availableVars = [...possibleVarSet];

  const varMapping = {};
  let counter = 0;

  return treeMap((node) => {
    if (node.args) {
      return {
        ...node,
        args: node.args.map(
          (el) => (varMapping[el] = varMapping[el] || availableVars[counter++])
        ),
      };
    }
    if (typeof node === 'string') return varMapping[node] || node;
    return node;
  }, expr);
};
