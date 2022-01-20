const car = (x) => x?.[0];
const cdr = (x) => x?.slice(1);
const cons = (x, y) => [x, ...y];
const list = (x, y) => [x, y];
const concat = (x, y) => [...x, ...y];
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

const printStack = (stack) => stack.map((s) => `\n    at ${s}`).join('');

const evaluate = (expr, env, stack = []) => {
  if (Array.isArray(expr)) {
    if (!car(expr)) throw new Error(`Empty expression${printStack(stack)}`);

    const {val, loc} = car(expr);
    const func = evaluate(car(expr), env, cons(`${val} ${loc}`, stack));
    if (typeof func === 'function') {
      const result = func(cdr(expr), env, cons(`${val} ${loc}`, stack));
      // console.log('>>>', toLisp(expr), '->', result);
      return result;
    }
    throw new Error(
      `${JSON.stringify(getVals(car(expr)))} is not a function${printStack(
        stack
      )}`
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

const math = (func) => (args, env, stack) =>
  args.map((x) => evaluate(x, env, stack)).reduce(func);

const defaultEnv = Object.entries({
  quote: ([a]) => getVals(a),
  atom: ([a], env, stack) => toBool(isAtom(evaluate(a, env, stack))),
  eq: ([a, b], env, stack) =>
    toBool(deepEq(evaluate(a, env, stack), evaluate(b, env, stack))),
  car: ([a], env, stack) => car(evaluate(a, env, stack)),
  cdr: ([a], env, stack) => cdr(evaluate(a, env, stack)),
  cons: ([a, b], env, stack) =>
    cons(evaluate(a, env, stack), evaluate(b, env, stack)),
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
        concat(
          argList.map((arg, i) => list(arg.val, evaluate(args[i], env, stack))),
          env
        ),
        stack
      ),
  defun: ([{val, loc}, args, body], env, stack) =>
    cons(
      list(val, evaluate([{val: 'lambda', loc}, args, body], env, stack)),
      env
    ),
  list: (args, env, stack) => args.map((a) => evaluate(a, env, stack)),
  floor: ([a], env, stack) => Math.floor(evaluate(a, env, stack)),
  numToChar: ([a], env, stack) => String.fromCharCode(evaluate(a, env, stack)),
  defmacro: ([{val, loc}, [argName], body], env, stack) =>
    cons(
      [
        val,
        (args, env) =>
          evaluate(
            evaluate(body, cons(list(argName.val, args), env), stack),
            env,
            cons(`defmacro ${loc}`, stack)
          ),
      ],
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
export const execute = (exprs) =>
  exprs.reduce((env, line) => evaluate(line, env), defaultEnv);
