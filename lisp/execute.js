const isAtom = (expr) => !Array.isArray(expr) || !expr.length;
const toBool = (val) => (val ? 't' : []);
const fromBool = (val) => val && (!Array.isArray(val) || val.length);
const evaluate = (expr, env) => {
  if (typeof expr === 'number') return expr;

  if (isAtom(expr)) {
    for (const [key, val] of env) {
      if (key === expr) return val;
    }
    throw new Error(`\`${expr}\` is not defined`);
  } else {
    const func = evaluate(expr[0], env);
    if (typeof func === 'function') {
      const result = func(expr.slice(1), env);
      // console.log('>>>', expr, '->', result);
      return result;
    }
    throw new Error(`Not a function: ${JSON.stringify(expr[0])}`);
  }
};

const deepEq = (a, b) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => deepEq(x, b[i]))
    : a === b;

const defaultEnv = Object.entries({
  quote: ([a]) => a,
  atom: ([a], env) => toBool(isAtom(evaluate(a, env))),
  eq: ([a, b], env) => toBool(deepEq(evaluate(a, env), evaluate(b, env))),
  car: ([a], env) => evaluate(a, env)[0],
  cdr: ([a], env) => evaluate(a, env).slice(1),
  cons: ([a, b], env) => [evaluate(a, env), ...evaluate(b, env)],
  cond: (args, env) => {
    for (const [pred, expr] of args) {
      if (fromBool(evaluate(pred, env))) return evaluate(expr, env);
    }
  },
  lambda:
    ([argList, body]) =>
    (args, env) =>
      evaluate(body, [
        ...argList.map((arg, i) => [arg, evaluate(args[i], env)]),
        ...env,
      ]),
  label: ([name, func], env) => [...env, [name, evaluate(func, env)]],
  defun: ([name, args, body], env) => [
    ...env,
    [name, evaluate(['lambda', args, body], env)],
  ],
  list: (args, env) => args.map((a) => evaluate(a, env)),
  ...Object.fromEntries(
    Object.entries({
      '+': (a, b) => a + b,
      '-': (a, b) => a - b,
      '*': (a, b) => a * b,
      '/': (a, b) => a / b,
      '%': (a, b) => a % b,
      '>': (a, b) => a > b,
      '<': (a, b) => a < b,
      '>=': (a, b) => a >= b,
      '<=': (a, b) => a <= b,
      '**': (a, b) => a ** b,
    }).map(([op, func]) => [
      op,
      (args, env) => args.map((x) => evaluate(x, env)).reduce(func),
    ])
  ),
  floor: ([a], env) => Math.floor(evaluate(a, env)),
  numToChar: ([a], env) => String.fromCharCode(evaluate(a, env)),
  defmacro: ([name, [argName], body], env) => [
    [
      name,
      (args, env) => evaluate(evaluate(body, [[argName, args], ...env]), env),
    ],
    ...env,
  ],
});

// takes an array of expressions, returns the value of the last one. The ones before it can only be defuns of defmacros
export const execute = (exprs) =>
  exprs.reduce((env, line) => evaluate(line, env), defaultEnv);
