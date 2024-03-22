const car = (x) => x?.[0];
const cdr = (x) => x?.slice(1);
const cons = (x, y) => [x, ...y];
const list = (x, y) => [x, y];
const concat = (x, y) => [...x, ...y];
const isAtom = (expr) => !Array.isArray(expr) || !expr.length;
const toBool = (val) => (val ? 't' : []);
const fromBool = (val) => val && (!Array.isArray(val) || val.length);

// const toLisp = (expr) =>
//   Array.isArray(expr) ? `(${expr.map(toLisp).join(' ')})` : expr.val;

const getVals = (expr) =>
  Array.isArray(expr)
    ? expr.map(getVals)
    : expr && typeof expr === 'object'
    ? expr.val
    : expr;

const printStack = (stack) => stack.map((s) => `\n    at ${s}`).join('');

const evaluate = (expr, env, stack, steps) => {
  if (Array.isArray(expr)) {
    if (!car(expr)) throw new Error(`Empty expression${printStack(stack)}`);

    const {val, loc} = car(expr);
    // if (loc) steps.push({...car(expr), env, stack});
    const func = evaluate(car(expr), env, cons(`${val} ${loc}`, stack), steps);
    if (typeof func === 'function') {
      try {
        return func(cdr(expr), env, cons(`${val} ${loc}`, stack), steps);
      } catch (e) {
        throw new Error(`An error occurred: ${e.message}${printStack(stack)}`);
      }
    }
    throw new Error(
      `${JSON.stringify(getVals(car(expr)))} is not a function${printStack(
        stack
      )}`
    );
  }

  if (expr && typeof expr === 'object') {
    const {val, loc} = expr;
    if (loc) steps.push({...expr, env, stack});
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

const math = (func) => (args, env, stack, steps) =>
  args.map((x) => evaluate(x, env, stack, steps)).reduce(func);

export const defaultEnv = Object.entries({
  quote: ([a]) => getVals(a),
  atom: ([a], env, stack, steps) =>
    toBool(isAtom(evaluate(a, env, stack, steps))),
  eq: ([a, b], env, stack, steps) =>
    toBool(
      deepEq(evaluate(a, env, stack, steps), evaluate(b, env, stack, steps))
    ),
  car: ([a], env, stack, steps) => car(evaluate(a, env, stack, steps)),
  cdr: ([a], env, stack, steps) => cdr(evaluate(a, env, stack, steps)),
  cons: ([a, b], env, stack, steps) =>
    cons(evaluate(a, env, stack, steps), evaluate(b, env, stack, steps)),
  cond: (args, env, stack, steps) => {
    for (const [pred, expr] of args) {
      if (fromBool(evaluate(pred, env, stack, steps)))
        return evaluate(expr, env, stack, steps);
    }
  },
  lambda:
    ([argList, body], outerEnv) =>
    (args, innerEnv, stack, steps) => {
      const env = [...innerEnv, ...outerEnv]; // innerEnv doesn't overwrite outerEnv, just supercedes it
      return evaluate(
        body,
        concat(
          argList.map((arg, i) =>
            list(arg.val, evaluate(args[i], env, stack, steps))
          ),
          env
        ),
        stack,
        steps
      );
    },
  defun: ([{val, loc}, args, body], env, stack, steps) =>
    cons(
      list(
        val,
        evaluate([{val: 'lambda', loc}, args, body], env, stack, steps)
      ),
      env
    ),
  list: (args, env, stack, steps) =>
    args.map((a) => evaluate(a, env, stack, steps)),
  floor: ([a], env, stack, steps) => Math.floor(evaluate(a, env, stack, steps)),
  numToChar: ([a], env, stack, steps) =>
    String.fromCharCode(evaluate(a, env, stack, steps)),
  defmacro: ([{val, loc}, [argName], body], env, stack, steps) =>
    cons(
      list(val, (args, env) =>
        evaluate(
          evaluate(body, cons(list(argName.val, args), env), stack, steps),
          env,
          cons(`defmacro ${loc}`, stack),
          steps
        )
      ),
      env
    ),
  '+': math((a, b) => a + b),
  '-': math((a, b) => a - b),
  '*': math((a, b) => a * b),
  '/': math((a, b) => a / b),
  '%': math((a, b) => a % b),
  '>': math((a, b) => a > b),
  '<': math((a, b) => a < b),
  '>=': math((a, b) => a >= b),
  '<=': math((a, b) => a <= b),
  '**': math((a, b) => a ** b),
});

// takes an array of expressions, returns the value of the last one. The ones before it can only be defuns of defmacros
export const execute = (exprs) => {
  const stack = [];
  const steps = [];
  const result = exprs.reduce(
    (env, line) => evaluate(line, env, stack, steps),
    defaultEnv
  );
  return {result, steps};
};
