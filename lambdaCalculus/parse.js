import {treeMap} from './utils.js';

const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === '(') indexes.push(result.length);
    else if (t === ')') {
      if (!indexes.length) throw new Error('Unexpected )');
      result.push(result.splice(indexes.pop()));
    } else result.push(t);
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

const parseLambda = (ast) => {
  if (!Array.isArray(ast)) return ast;
  ast = ast.map(parseLambda);
  if (ast[0] !== 'λ') return ast;

  const dotIndex = ast.indexOf('.');
  return {args: [...ast.slice(1, dotIndex)], body: ast.slice(dotIndex + 1)};
};

const parseExpr = (str) => parseLambda(nest(str.match(/[λ.()a-z]|\w+/g)));

const resolvePlaceholders = (expr, lib) =>
  treeMap((node) => {
    if (typeof node !== 'string' || node !== node.toUpperCase()) return node;
    if (lib[node]) return lib[node];
    throw new Error(`"${node}" is not defined`);
  }, expr);

export const parse = (str) => {
  const lines = str
    .trim()
    .split('\n')
    .filter((l) => l.trim());
  const lib = {};
  for (const line of lines) {
    const parts = line.trim().split(/\s*=\s*/);
    const code = resolvePlaceholders(parseExpr(parts[parts.length - 1]), lib);
    if (parts.length > 1) lib[parts[0]] = code;
    else if (line === lines[lines.length - 1]) return code;
  }
};
