import {parseExpr} from './parse.js';
import {treeMap} from './utils.js';

export const resolvePlaceholders = (expr, lib) =>
  treeMap((node) => {
    if (typeof node !== 'string' || node[0] !== '$') return node;
    const key = node.slice(1);
    if (lib[key]) return lib[key];
    throw new Error(`"${node}" is not defined`);
  }, expr);

export const parseLib = (str) =>
  str
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .reduce((res, line) => {
      const [key, code] = line.trim().split(/\s*=\s*/);
      return {...res, [key]: parseExpr(code)};
    }, {});
