import {parse} from './parse.js';
import {simplify} from './simplify.js';
import {renameVars} from './renameVars.js';
import {treeMap} from './utils.js';
import {exprToString} from './exprToString.js';

const useNamesFromLib = (expr, lib, steps) => {
  const lookup = {};
  for (const key in lib) {
    const simplified = simplify(lib[key], steps);
    lookup[exprToString(renameVars(simplified))] = key;
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
    const lastLineOfInput = str.trim().split('\n').pop();
    const parsedToString = exprToString(code);
    if (lastLineOfInput !== parsedToString) {
      steps.push(`${lastLineOfInput} => ${parsedToString}`);
    }
    const simplified = simplify(code, steps);
    const withNamesFromLib = useNamesFromLib(simplified, lib, steps);
    const result = exprToString(renameVars(withNamesFromLib));
    return {result, steps};
  } catch (e) {
    return {result: e.stack, steps: []};
  }
};
