import {exprToString, parse} from './parse.js';
import {simplify} from './simplify.js';
import {renameVars} from './renameVars.js';
import {treeMap} from './utils.js';

const useNamesFromLib = (expr, lib, steps) => {
  const lookup = {};
  for (const key in lib) {
    lookup[exprToString(renameVars(simplify(lib[key], steps)))] = key;
  }
  return treeMap((node) => {
    const r = lookup[exprToString(renameVars(node))];
    if (r) steps.push(`${exprToString(node)} => ${exprToString(r)}`);
    return r || node;
  }, expr);
};

export const evaluate = (str) => {
  try {
    const {lib, code} = parse(str);
    const steps = []; // this gets mutated by lots of stuff, yayyyy
    const a = str.trim().split('\n').pop();
    const b = exprToString(code);
    if (a !== b) steps.push(`${a} => ${b}`);
    const simplified = simplify(code, steps);
    const withNamesFromLib = useNamesFromLib(simplified, lib, steps);
    const withRenamedVars = renameVars(withNamesFromLib);
    const result = exprToString(withRenamedVars);
    return {result, steps};
  } catch (e) {
    return {result: e.stack, steps: []};
  }
};
