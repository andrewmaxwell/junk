const parse = (str) => {
  const indexes = [];
  const result = [];
  for (const t of str.match(/\(|\)|-?\d+|\+|-|\*|\/|\^|[a-z]+/g)) {
    if (t === '(') indexes.push(result.length);
    else
      result.push(t === ')' ? result.splice(indexes.pop()) : isNaN(t) ? t : +t);
  }
  return result[0];
};

const isNum = (x) => !isNaN(x);

const deepEq = (a, b) =>
  a === b ||
  (Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((v, i) => v === b[i]));

const simplify = (ast) => {
  if (!Array.isArray(ast)) return ast;
  for (let i = 1; i < ast.length; i++) ast[i] = simplify(ast[i]);
  const [op, a, b] = ast;
  if (op === '+') {
    if (isNum(a) && isNum(b)) return a + b;
    if (!a) return b;
    if (!b) return a;
    if (deepEq(a, b)) return simplify(['*', 2, a]);

    if (a[0] === '*') {
      if (deepEq(b, a[1])) return ['*', ['+', a[2], 1], b];
      if (deepEq(b, a[2])) return ['*', ['+', a[1], 1], b];
    }
    if (b[0] === '*') {
      if (deepEq(a, b[1])) return ['*', ['+', b[2], 1], a];
      if (deepEq(a, b[2])) return ['*', ['+', b[1], 1], a];
    }
  } else if (op === '-') {
    if (isNum(a) && isNum(b)) return a - b;
    if (!a) return simplify(['*', -1, b]);
    if (!b) return a;
    if (deepEq(a, b)) return 0;

    if (a[0] === '*') {
      if (deepEq(b, a[1])) return simplify(['*', ['-', a[2], 1], b]);
      if (deepEq(b, a[2])) return simplify(['*', ['-', a[1], 1], b]);
    }
    if (b[0] === '*') {
      if (deepEq(a, b[1])) return simplify(['*', ['-', b[2], 1], a]);
      if (deepEq(a, b[2])) return simplify(['*', ['-', b[1], 1], a]);
    }
  } else if (op === '*') {
    if (isNum(a) && isNum(b)) return a * b;
    if (!a || !b) return 0;
    if (a === 1) return b;
    if (b === 1) return a;
    if (deepEq(a, b)) return simplify(['^', a, 2]);

    if (isNum(a)) {
      if (b[0] === '+' || b[0] === '-')
        return simplify([b[0], ['*', a, b[1]], ['*', a, b[2]]]);
      if (b[0] === '*' || b[0] === '/') {
        if (isNum(b[1])) return simplify([b[0], a * b[1], b[2]]);
        if (isNum(b[2]))
          return simplify([b[0], b[1], b[0] === '*' ? a * b[2] : a / b[2]]);
      }
    }
    if (isNum(b)) {
      if (a[0] === '+' || a[0] === '-')
        return simplify([a[0], ['*', b, a[1]], ['*', b, a[2]]]);
      if (a[0] === '*' || a[0] === '/') {
        if (isNum(a[1])) return simplify([a[0], b * a[1], a[2]]);
        if (isNum(a[2]))
          return simplify([a[0], a[1], a[0] === '*' ? b * a[2] : b / a[2]]);
      }
    }
  } else if (op === '/') {
    if (isNum(a) && isNum(b)) return a / b;
    if (!a) return 0;
    if (b === 1) return a;
    if (deepEq(a, b)) return 1;
  } else if (op === '^') {
    if (isNum(a) && isNum(b)) return a ** b;
    if (!a) return 0;
    if (!b || a === 1) return 1;
    if (b === 1) return a;
  }

  return ast;
};

const differentiate = (ast) => {
  if (isNum(ast)) return 0;
  if (ast === 'x') return 1;

  const [op, a, b] = ast;

  if (op === '+') {
    return [op, differentiate(a), differentiate(b)];
  } else if (op === '*') {
    if (a === 'x') return b;
    if (b === 'x') return a;
  } else if (op === '/') {
    if (a === 'x') return 1 / b;
    return ['/', ['*', -1, a], ['^', b, 2]];
  } else if (op === '^') {
    if (isNum(b)) return ['^', ['*', b, a], b - 1];
  } else if (op === 'cos') {
    if (a[0] === '*') {
      if (a[1] === 'x') return ['*', a[2], ['*', '-1', ['sin', a]]];
      if (a[2] === 'x') return ['*', a[1], ['*', '-1', ['sin', a]]];
    }
    return ['*', '-1', ['sin', a]];
  } else if (op === 'sin') {
    if (a[0] === '*') {
      if (a[1] === 'x') return ['*', a[2], ['cos', a]];
      if (a[2] === 'x') return ['*', a[1], ['cos', a]];
    }
    return ['cos', a];
  } else if (op === 'tan') {
    if (a[0] === '*') {
      if (a[1] === 'x') return ['*', a[2], ['^', ['cos', a], -2]];
      if (a[2] === 'x') return ['*', a[1], ['^', ['cos', a], -2]];
    }
    return ['^', ['cos', a], -2];
  } else if (op === 'ln') {
    return ['/', 1, a];
  } else if (op === 'exp') {
    if (a[0] === '*') {
      if (a[1] === 'x') return ['*', a[2], ['exp', a]];
      if (a[2] === 'x') return ['*', a[1], ['exp', a]];
    }
    return ast;
  }
  return ast;
};

const toStr = (ast) =>
  Array.isArray(ast) ? `(${ast.map(toStr).join(' ')})` : ast;

const diff = (expr) =>
  '' + toStr(simplify(differentiate(simplify(parse(expr)))));

const {Test} = require('./test');

Test.assertEquals(diff('5'), '0', 'constant should return 0');
Test.assertEquals(diff('x'), '1', 'x should return 1');
Test.assertEquals(diff('(+ x x)'), '2', 'x+x should return 2');
Test.assertEquals(diff('(- x x)'), '0', 'x-x should return 0');
Test.assertEquals(diff('(* x 2)'), '2', '2*x should return 2');
Test.assertEquals(diff('(/ x 2)'), '0.5', 'x/2 should return 0.5');
Test.assertEquals(diff('(^ x 2)'), '(* 2 x)', 'x^2 should return 2*x');
Test.assertEquals(
  diff('(cos x)'),
  '(* -1 (sin x))',
  'cos(x) should return -1 * sin(x)'
);
Test.assertEquals(diff('(sin x)'), '(cos x)', 'sin(x) should return cos(x)');

let result = diff('(tan x)');
Test.expect(
  result == '(+ 1 (^ (tan x) 2))' ||
    result == '(^ (cos x) -2)' ||
    result == '(/ 1 (^ (cos x) 2))',
  'tan(x) should return (+ 1 (^ (tan x) 2)) or (^ (cos x) -2) or (/ 1 (^ (cos x) 2)) but got ' +
    result
);

Test.assertEquals(diff('(exp x)'), '(exp x)', 'exp(x) should return exp(x)');
Test.assertEquals(diff('(ln x)'), '(/ 1 x)', 'ln(x) should return 1/x');

Test.assertEquals(diff('(+ x (+ x x))'), '3', 'x+(x+x) should return 3');
Test.assertEquals(diff('(- (+ x x) x)'), '1', '(x+x)-x should return 1');
Test.assertEquals(diff('(* 2 (+ x 2))'), '2', '2*(x+2) should return 2');
Test.assertEquals(
  diff('(/ 2 (+ 1 x))'),
  '(/ -2 (^ (+ 1 x) 2))',
  '2/(1+x) should return -2/(1+x)^2'
);
Test.assertEquals(
  diff('(cos (+ x 1))'),
  '(* -1 (sin (+ x 1)))',
  'cos(x+1) should return -1 * sin(x+1)'
);

result = diff('(cos (* 2 x))');
Test.expect(
  result == '(* 2 (* -1 (sin (* 2 x))))' || result == '(* -2 (sin (* 2 x)))',
  'Expected (* 2 (* -1 (sin (* 2 x)))) or (* -2 (sin (* 2 x))) but got ' +
    result
);

Test.assertEquals(
  diff('(sin (+ x 1))'),
  '(cos (+ x 1))',
  'sin(x+1) should return cos(x+1)'
);
Test.assertEquals(
  diff('(sin (* 2 x))'),
  '(* 2 (cos (* 2 x)))',
  'sin(2*x) should return 2*cos(2*x)'
);

result = diff('(tan (* 2 x))');
Test.expect(
  result == '(* 2 (+ 1 (^ (tan (* 2 x)) 2)))' ||
    result == '(* 2 (^ (cos (* 2 x)) -2))' ||
    result == '(/ 2 (^ (cos (* 2 x)) 2))',
  'Expected (* 2 (+ 1 (^ (tan (* 2 x)) 2))) or (* 2 (^ (cos (* 2 x)) -2)) or (/ 2 (^ (cos (* 2 x)) 2)) but got ' +
    result
);

Test.assertEquals(
  diff('(exp (* 2 x))'),
  '(* 2 (exp (* 2 x)))',
  'exp(2*x) should return 2*exp(2*x)'
);

Test.assertEquals(
  diff(diff('(sin x)')),
  '(* -1 (sin x))',
  'Second deriv. sin(x) should return -1 * sin(x)'
);
Test.assertEquals(
  diff(diff('(exp x)')),
  '(exp x)',
  'Second deriv. exp(x) should return exp(x)'
);

// Accepting (* 3 (* 2 x)) or (* 6 x)
result = diff(diff('(^ x 3)'));
Test.expect(
  result == '(* 3 (* 2 x))' || result == '(* 6 x)',
  'Expected (* 3 (* 2 x)) or (* 6 x) but got ' + result
);
