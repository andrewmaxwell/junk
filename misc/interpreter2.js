/* eslint-disable no-use-before-define */

const ops = {
  '=>': {
    prec: 1,
    func: ([, name, ...argNames], body, vars) => {
      if (vars[name] !== undefined && !vars[name].body)
        throw new Error(`${name} is already defined.`);
      if (argNames.some((n, i) => argNames.indexOf(n) !== i))
        throw new Error(`Duplicate argument names`);
      const badVars = body.filter(
        (t) => isNaN(t) && !ops[t] && !['(', ')', ...argNames].includes(t)
      );
      if (badVars.length) throw new Error(`Bad vars: ${badVars.join(', ')}`);
      vars[name] = {argNames, body};
      return '';
    },
  },
  '=': {
    prec: 2,
    func: (a, b, vars) => {
      if (vars[a] && vars[a].body) throw new Error(`${a} is already defined.`);
      return (vars[a] = evaluate(b, vars));
    },
  },
  '-': {prec: 3, func: (a, b, vars) => evaluate(a, vars) - evaluate(b, vars)},
  '+': {prec: 3, func: (a, b, vars) => evaluate(a, vars) + evaluate(b, vars)},
  '*': {prec: 4, func: (a, b, vars) => evaluate(a, vars) * evaluate(b, vars)},
  '/': {prec: 4, func: (a, b, vars) => evaluate(a, vars) / evaluate(b, vars)},
  '%': {prec: 4, func: (a, b, vars) => evaluate(a, vars) % evaluate(b, vars)},
};

const functionCall = (name, args, vars) => {
  if (!vars[name]) throw new Error(`${name} is not defined`);
  const {argNames, body} = vars[name];
  if (argNames.length !== args.length)
    throw new Error(
      `${name} takes ${argNames.length} arguments, not ${args.length}`
    );
  return evaluate(body, {
    ...vars,
    ...argNames.reduce((o, n, i) => ((o[n] = args[i]), o), {}),
  });
};
const indexOfLastFunctionCall = (args, vars) => {
  for (let i = args.length - 1; i >= 0; i--) {
    const t = args[i];
    if (vars[t] && vars[t].body) return i;
  }
  return -1;
};
const evalArgs = (args, vars) => {
  const index = indexOfLastFunctionCall(args, vars);
  if (index < 0) return args;
  return [
    ...evalArgs(args.slice(0, index), vars),
    functionCall(args[index], args.slice(index + 1), vars),
  ];
};

const evaluate = (tokens, vars) => {
  if (!Array.isArray(tokens)) return tokens;
  if (!tokens.length) return '';
  if (tokens.length === 1) {
    const [t] = tokens;
    if (typeof t === 'string') {
      if (vars[t] === undefined) throw new Error(`${t} is not defined.`);
      return vars[t].body ? functionCall(t, [], vars) : vars[t];
    }
    return t;
  }

  let level = 0;
  let opIndex;
  tokens.forEach((t, i) => {
    if (t === '(') level++;
    else if (t === ')') level--;
    else if (
      !level &&
      ops[t] &&
      (!opIndex ||
        ops[t].prec < ops[tokens[opIndex]].prec ||
        (tokens[opIndex] !== '=' && ops[t].prec == ops[tokens[opIndex]].prec))
    ) {
      opIndex = i;
    }
  });
  if (!opIndex && tokens[0] === '(') return evaluate(tokens.slice(1, -1), vars);
  if (!opIndex && typeof tokens[0] === 'string')
    return functionCall(tokens[0], evalArgs(tokens.slice(1), vars), vars);
  return ops[tokens[opIndex]].func(
    tokens.slice(0, opIndex),
    tokens.slice(opIndex + 1),
    vars
  );
};

function Interpreter() {
  this.vars = {};
  this.input = (expr) => {
    const tokens = expr
      .split(/\s*(=>|[-+*/%=()]|[A-Za-z_][A-Za-z0-9_]*|[0-9]*\.?[0-9]+)\s*/g)
      .filter((s) => !s.match(/^\s*$/))
      .map((v) => (isNaN(v) ? v : Number(v)));

    if (tokens.slice(1).includes('fn'))
      throw new Error('functions cannot be in expressions');

    return evaluate(tokens, this.vars);
  };
}

////////////// TESTS
const {Test} = require('./test');
const interpreter = new Interpreter();

interpreter.input('fn avg x y => (x + y) / 2');
interpreter.input('fn echo x => x');
interpreter.input('avg echo 1000 echo 3000');

Test.assertSimilar(interpreter.input('1 + 1'), 2);
Test.assertSimilar(interpreter.input('2 - 1'), 1);
Test.assertSimilar(interpreter.input('2 * 3'), 6);
Test.assertSimilar(interpreter.input('8 / 4'), 2);
Test.assertSimilar(interpreter.input('7 % 4'), 3);
Test.assertSimilar(interpreter.input('x = 1'), 1);
Test.assertSimilar(interpreter.input('x'), 1);
Test.assertSimilar(interpreter.input('x + 3'), 4);
Test.expectError(function () {
  interpreter.input('y');
});
Test.expectNoError(function () {
  interpreter.input('fn avg x y => (x + y) / 2');
});
Test.assertSimilar(interpreter.input('avg 4 2'), 3);
Test.expectError(function () {
  interpreter.input('avg 7');
});
Test.expectError(function () {
  interpreter.input('avg 7 2 4');
});
Test.expectError(function () {
  interpreter.input('fn x => 0');
});
Test.expectError(function () {
  interpreter.input('avg = 5');
});
Test.expectNoError(function () {
  interpreter.input('fn avg => 0');
});
Test.expectError(() => {
  interpreter.input('fn add x y => x + z');
});
Test.expectError(() => {
  interpreter.input('(fn f => 1)');
});

interpreter.input('fn one => 1');
Test.assertSimilar(interpreter.input('one'), 1);

interpreter.input('fn avg x y => (x + y) / 2');
interpreter.input('fn echo x => x');
Test.assertSimilar(interpreter.input('avg echo 4 echo 2'), 3);

interpreter.input('x = 0');
Test.expectError(() => interpreter.input('fn x => 0'));
