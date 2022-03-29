import {renameVars} from './renameVars.js';
import {nest, treeMap} from './utils.js';
import {exprToString} from './exprToString.js';

const parseLambda = (ast) => {
  if (!Array.isArray(ast)) return ast;
  ast = ast.map(parseLambda);
  if (ast[0] !== 'λ') return ast;

  const dotIndex = ast.indexOf('.');
  if (dotIndex === -1) {
    throw new Error(
      `Could not parse "${exprToString(
        ast
      )}". Lambda expressions must contain a "." after their argument(s).`
    );
  }
  return {
    args: [...ast.slice(1, dotIndex)],
    body: parseLambda(ast.slice(dotIndex + 1)),
  };
};

const parseExpr = (str) => parseLambda(nest(str.match(/[λ.()a-z]|[A-Z]+/g)));

const resolvePlaceholders = (expr, lib) =>
  treeMap((node) => {
    if (typeof node !== 'string' || node !== node.toUpperCase()) return node;
    if (lib[node]) return renameVars(lib[node], expr);
    throw new Error(`${node} is not defined`);
  }, expr);

export const parse = (str) => {
  const lines = str
    .replace(/\/\/.*/g, '') // remove comments
    .trim()
    .split('\n')
    .filter((l) => l.trim());
  const lib = {};
  for (const line of lines) {
    const parts = line.trim().split(/\s*=\s*/);
    const code = resolvePlaceholders(parseExpr(parts[parts.length - 1]), lib);
    if (parts.length > 1) lib[parts[0]] = code;
    if (line === lines[lines.length - 1]) return {lib, code};
  }
};
