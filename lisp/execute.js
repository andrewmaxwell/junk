const isAtom = (expr) => !Array.isArray(expr) || !expr.length;
const toBool = (val) => (val ? 't' : []);
const evaluate = (expr, env) => {
  if (!isNaN(expr)) return Number(expr);

  if (isAtom(expr)) {
    for (const [key, val] of env) {
      if (key === expr) return val;
    }
    throw new Error(`${expr} is not defined`);
  } else {
    const func = evaluate(expr[0], env);
    if (typeof func === 'function') return func(expr.slice(1), env);
    throw new Error(`Not a function: ${JSON.stringify(expr[0])}`);
  }
};

const defaultEnv = Object.entries({
  quote: ([a]) => a,
  atom: ([a], env) => toBool(isAtom(evaluate(a, env))),
  eq: ([a, b], env) => {
    a = evaluate(a, env);
    b = evaluate(b, env);
    return toBool(a === b || (!a.length && !b.length));
  },
  car: ([a], env) => evaluate(a, env)[0],
  cdr: ([a], env) => evaluate(a, env).slice(1),
  cons: ([a, b], env) => [evaluate(a, env), ...evaluate(b, env)],
  cond: (args, env) => {
    for (const [pred, expr] of args) {
      const v = evaluate(pred, env);
      if (v && (!Array.isArray(v) || v.length)) return evaluate(expr, env);
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
      '=': (a, b) => a === b,
      '**': (a, b) => a ** b,
      and: (a, b) => a && b,
      or: (a, b) => a || b,
    }).map(([op, func]) => [
      op,
      ([a, b], env) => func(evaluate(a, env), evaluate(b, env)),
    ])
  ),
  floor: ([a], env) => Math.floor(evaluate(a, env)),
});

// takes an array of expressions, returns the value of the last one. The ones before it can only be defuns
export const execute = (exprs) =>
  exprs.reduce((env, line) => evaluate(line, env), defaultEnv);
