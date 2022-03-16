import {exprToString, parse} from './parse.js';
import {simplify} from './simplify.js';
import {replaceVars} from './replaceVars.js';
import {treeMap} from './utils.js';

const useNamesFromLib = (expr, lib) => {
  const lookup = {};
  for (const key in lib) {
    lookup[exprToString(replaceVars(simplify(lib[key])))] = key;
  }
  return treeMap(
    (node) => lookup[exprToString(replaceVars(node))] || node,
    expr
  );
};

export const evaluate = (str, debug) => {
  try {
    const {lib, code} = parse(str);
    return exprToString(
      replaceVars(useNamesFromLib(simplify(code, debug), lib))
    );
  } catch (e) {
    return e.message;
  }
};
