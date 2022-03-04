// https://en.wikipedia.org/wiki/Lambda_calculus
// https://justine.lol/lambda/

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

const treeMap = (func, ob) => {
  if (!ob || typeof ob !== 'object') return func(ob);
  const res = Array.isArray(ob) ? [] : {};
  for (const key in ob) res[key] = treeMap(func, ob[key]);
  return func(res);
};

const eachNode = (func, ob) => {
  func(ob);
  if (ob && typeof ob === 'object') {
    for (const key in ob) eachNode(func, ob[key]);
  }
};

const parseLambda = (ast) => {
  if (!Array.isArray(ast)) return ast;
  ast = ast.map(parseLambda);
  if (ast[0] !== 'λ') return ast;

  const dotIndex = ast.indexOf('.');
  return {args: [...ast.slice(1, dotIndex)], body: ast.slice(dotIndex + 1)};
};

const parseExpr = (str) => parseLambda(nest(str.match(/[λ.()a-z]|\$\w+/g)));

const letters = 'abcdefghijklmnopqrstuvwxyz';

const replaceVars = (expr, parentExpr) => {
  const possibleVarSet = new Set(letters);
  eachNode((node) => possibleVarSet.delete(node), parentExpr);
  const availableVars = [...possibleVarSet];

  const varMapping = {};
  let counter = 0;

  return treeMap((node) => {
    if (node?.args)
      return node.args.map(
        (el) => (varMapping[el] = varMapping[el] = availableVars[counter++])
      );
    if (node in varMapping) return varMapping[node];
    return node;
  }, expr);
};

const apply = (a, b) => {
  if (!a || typeof a !== 'object') {
    throw new Error(`${JSON.stringify(a)} is not a function.`);
  }

  console.log(`Applying ${JSON.stringify(a)} ${JSON.stringify(b)}`);

  const [varName, ...rest] = a.args;
  const bWithReplacedVars = replaceVars(b, a);
  const body = treeMap(
    (node) => (node === varName ? bWithReplacedVars : node),
    a.body
  );
  const r = rest.length ? {args: rest, body} : body;
  console.log('apply>>>', JSON.stringify(r));
  return r;
};

const simplify = (expr, lib) => {
  if (typeof expr === 'string' && expr[0] === '$') {
    const key = expr.slice(1);
    if (lib[key]) return lib[key];
    throw new Error(`"${expr}" is not defined`);
  }

  if (!Array.isArray(expr)) return expr;

  const terms = expr.map((el) => simplify(el, lib));
  const indexOfUnresolved = terms.findIndex((n) => !n || typeof n !== 'object');

  const r =
    indexOfUnresolved === 0
      ? terms
      : indexOfUnresolved > 0
      ? [
          terms.slice(0, indexOfUnresolved + 1).reduce(apply),
          ...terms.slice(indexOfUnresolved + 1),
        ]
      : terms.reduce(apply);
  console.dir({before: expr, after: r, indexOfUnresolved}, {depth: Infinity});
  return r;
};

const toStr = (expr) =>
  Array.isArray(expr)
    ? expr.map(toStr).join('')
    : expr && typeof expr === 'object'
    ? `λ${expr.args.join('')}.${toStr(expr.body)}`
    : expr;

const evaluate = (str, lib) => toStr(simplify(parseExpr(str), lib));

const parseLib = (str) =>
  str
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .reduce((res, line) => {
      const [key, code] = line.trim().split(/\s*=\s*/);
      return {...res, [key]: parseExpr(code)};
    }, {});

import {Test} from '../misc/test.js';

const lib = parseLib(`
false = λab.b
true = λab.a
inc = λnfx.f(nfx) 
plus = λmnfx.mf(nfx)
two = λfx.f(fx)
three = λfx.f(f(fx))`);

console.log(lib);

const tests = [
  ['x', 'x'],
  ['λx.x', 'λx.x'],
  ['(λx.x)y', 'y'],
  ['(λx.x)(λx.x)', 'λx.x'],
  ['$plus $two $three', 'λfx.f(f(f(f(fx))))'],
  // ['inc (inc three)', 'λfx.f(f(f(f(fx))))'],
];

for (const [input, expected] of tests) {
  Test.assertEquals(evaluate(input, lib), expected);
}
