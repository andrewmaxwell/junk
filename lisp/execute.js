const isAtom = (expr) => !Array.isArray(expr) || !expr.length;
const toBool = (val) => (val ? 't' : []);
const fromBool = (val) => val && (!Array.isArray(val) || val.length);

// const toLisp = (expr) =>
//   Array.isArray(expr) ? `(${expr.map(toLisp).join(' ')})` : expr;

const getVals = (expr) =>
  Array.isArray(expr)
    ? expr.map(getVals)
    : expr && typeof expr === 'object'
    ? expr.val
    : expr;

const printStack = (stack) =>
  stack
    .map((s) => `\n    at ${s}`)
    .reverse()
    .join('');

const evaluate = (expr, env, stack = []) => {
  if (Array.isArray(expr)) {
    if (!expr[0]) throw new Error(`Empty expression${printStack(stack)}`);

    const {val, loc} = expr[0];
    const func = evaluate(expr[0], env, [...stack, `${val} ${loc}`]);
    if (typeof func === 'function') {
      const result = func(expr.slice(1), env, [...stack, `${val} ${loc}`]);
      // console.log('>>>', toLisp(expr), '->', result);
      return result;
    }
    throw new Error(
      `JSON.stringify(getVals(expr[0])) is not a function${printStack(stack)}`
    );
  }

  if (expr && typeof expr === 'object') {
    const {val, loc} = expr;
    if (typeof val === 'number') return val;

    for (const [key, value] of env) {
      if (key === val) return value;
    }
    throw new Error(`\`${val}\` is not defined at ${loc}${printStack(stack)}`);
  }

  throw new Error(JSON.stringify(expr) + printStack(stack));
};

const deepEq = (a, b) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => deepEq(x, b[i]))
    : a === b;

const defaultEnv = Object.entries({
  quote: ([a]) => getVals(a),
  atom: ([a], env, stack) => toBool(isAtom(evaluate(a, env, stack))),
  eq: ([a, b], env, stack) =>
    toBool(deepEq(evaluate(a, env, stack), evaluate(b, env, stack))),
  car: ([a], env, stack) => evaluate(a, env, stack)[0],
  cdr: ([a], env, stack) => evaluate(a, env, stack).slice(1),
  cons: ([a, b], env, stack) => [
    evaluate(a, env, stack),
    ...evaluate(b, env, stack),
  ],
  cond: (args, env, stack) => {
    for (const [pred, expr] of args) {
      if (fromBool(evaluate(pred, env, stack)))
        return evaluate(expr, env, stack);
    }
  },
  lambda:
    ([argList, body]) =>
    (args, env, stack) =>
      evaluate(
        body,
        [
          ...argList.map((arg, i) => [arg.val, evaluate(args[i], env, stack)]),
          ...env,
        ],
        stack
      ),
  defun: ([{val, loc}, args, body], env, stack) => [
    ...env,
    [val, evaluate([{val: 'lambda', loc}, args, body], env, stack)],
  ],
  list: (args, env, stack) => args.map((a) => evaluate(a, env, stack)),
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
        args.map((x) => evaluate(x, env, stack)).reduce(func),
    ])
  ),
  floor: ([a], env, stack) => Math.floor(evaluate(a, env, stack)),
  numToChar: ([a], env, stack) => String.fromCharCode(evaluate(a, env, stack)),
  defmacro: ([{val, loc}, [argName], body], env, stack) => [
    [
      val,
      (args, env) =>
        evaluate(evaluate(body, [[argName.val, args], ...env], stack), env, [
          ...stack,
          `defmacro ${loc}`,
        ]),
    ],
    ...env,
  ],
});

// takes an array of expressions, returns the value of the last one. The ones before it can only be defuns of defmacros
export const execute = (exprs) =>
  exprs.reduce((env, line) => evaluate(line, env), defaultEnv);
