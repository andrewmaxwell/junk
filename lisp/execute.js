const isAtom = (expr) => !Array.isArray(expr) || !expr.length;
const toBool = (val) => (val ? 't' : []);
const fromBool = (val) => val && (!Array.isArray(val) || val.length);
// const toLisp = (expr) =>
//   Array.isArray(expr) ? `(${expr.map(toLisp).join(' ')})` : expr;
const printStack = (stack) =>
  stack
    .map((s) => `\n    at ${s}`)
    .reverse()
    .join('');
const evaluate = (expr, env, stack = []) => {
  if (typeof expr === 'number') return expr;

  if (isAtom(expr)) {
    for (const [key, val] of env) {
      if (key === expr) return val;
    }
    throw new Error(`\`${expr}\` is not defined${printStack(stack)}`);
  } else {
    const func = evaluate(expr[0], env, [...stack, expr[0]]);
    if (typeof func === 'function') {
      const result = func(expr.slice(1), env, [...stack, expr[0]]);
      // console.log('>>>', toLisp(expr), '->', result);
      return result;
    }
    throw new Error(
      `Not a function: ${JSON.stringify(expr[0])}${printStack(stack)}`
    );
  }
};

const deepEq = (a, b) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => deepEq(x, b[i]))
    : a === b;

const defaultEnv = Object.entries({
  quote: ([a]) => a,
  atom: ([a], env, stack) =>
    toBool(isAtom(evaluate(a, env, [...stack, 'atom']))),
  eq: ([a, b], env, stack) =>
    toBool(deepEq(evaluate(a, env), evaluate(b, env, [...stack, 'eq']))),
  car: ([a], env, stack) => evaluate(a, env, [...stack, 'car'])[0],
  cdr: ([a], env, stack) => evaluate(a, env, [...stack, 'cdr']).slice(1),
  cons: ([a, b], env, stack) => [
    evaluate(a, env, [...stack, 'cons head']),
    ...evaluate(b, env, [...stack, 'cons tail']),
  ],
  cond: (args, env, stack) => {
    for (const [pred, expr] of args) {
      if (fromBool(evaluate(pred, env, [...stack, 'cond predicate'])))
        return evaluate(expr, env, [...stack, 'cond body']);
    }
  },
  lambda:
    ([argList, body]) =>
    (args, env, stack) =>
      evaluate(
        body,
        [
          ...argList.map((arg, i) => [arg, evaluate(args[i], env, stack)]),
          ...env,
        ],
        stack
      ),
  label: ([name, func], env, stack) => [
    ...env,
    [name, evaluate(func, env, [...stack, 'label'])],
  ],
  defun: ([name, args, body], env, stack) => [
    ...env,
    [name, evaluate(['lambda', args, body], env, [...stack, 'defun'])],
  ],
  list: (args, env, stack) =>
    args.map((a) => evaluate(a, env, [...stack, 'list'])),
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
      (args, env, stack) =>
        args.map((x) => evaluate(x, env, [...stack, op])).reduce(func),
    ])
  ),
  floor: ([a], env, stack) => Math.floor(evaluate(a, env, [...stack, 'floor'])),
  numToChar: ([a], env, stack) =>
    String.fromCharCode(evaluate(a, env, [...stack, 'numToChar'])),
  defmacro: ([name, [argName], body], env, stack) => [
    [
      name,
      (args, env) =>
        evaluate(
          evaluate(body, [[argName, args], ...env], [...stack, 'macro body']),
          env,
          [...stack, 'defmacro']
        ),
    ],
    ...env,
  ],
});

// takes an array of expressions, returns the value of the last one. The ones before it can only be defuns of defmacros
export const execute = (exprs) =>
  exprs.reduce((env, line) => evaluate(line, env), defaultEnv);
