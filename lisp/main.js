const parse = (() => {
  const tokenize = (str) => {
    const res = [];
    while ((str = str.trim())) {
      const t = str.match(/^(\w|\.)+|^\(|^\)|^'/);
      if (!t) throw new Error(`Bad token! ${str}`);
      res.push(t[0]);
      str = str.slice(t[0].length);
    }
    return res;
  };

  const nest = (tokens) => {
    const stack = [[]];
    for (let i = 0; i < tokens.length; i++) {
      const s = tokens[i];
      if (s === '(') {
        const n = [];
        stack[stack.length - 1].push(n);
        stack.push(n);
      } else if (s === ')') {
        stack.pop();
        if (!stack)
          throw new Error('Unexpected ): ' + tokens.slice(i).join(' '));
      } else {
        stack[stack.length - 1].push(s);
      }
    }
    if (stack.length !== 1)
      throw new Error('Expected ): ' + JSON.stringify(stack));
    return stack[0];
  };

  const parseQuote = (node) =>
    Array.isArray(node)
      ? node
          .reduce(
            (res, el) =>
              res[res.length - 1] === "'"
                ? [...res.slice(0, -1), ['quote', el]]
                : [...res, el],
            []
          )
          .map(parseQuote)
      : node;

  return (str) => parseQuote(nest(tokenize(str)));
})();

const execute = (() => {
  const isAtom = (expr) => !Array.isArray(expr) || !expr.length;
  const toBool = (val) => (val ? 't' : []);
  const evaluate = (expr, env) => {
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

  const defaultEnv = [
    ['quote', ([a]) => a],
    ['atom', ([a], env) => toBool(isAtom(evaluate(a, env)))],
    [
      'eq',
      ([a, b], env) => {
        a = evaluate(a, env);
        b = evaluate(b, env);
        return toBool(a === b || (!a.length && !b.length));
      },
    ],
    ['car', ([a], env) => evaluate(a, env)[0]],
    ['cdr', ([a], env) => evaluate(a, env).slice(1)],
    ['cons', ([a, b], env) => [evaluate(a, env), ...evaluate(b, env)]],
    [
      'cond',
      (args, env) => {
        for (const [pred, expr] of args) {
          const v = evaluate(pred, env);
          if (v && (!Array.isArray(v) || v.length)) return evaluate(expr, env);
        }
      },
    ],
    [
      'lambda',
      ([argList, body]) =>
        (args, env) =>
          evaluate(
            body,
            argList.map((arg, i) => [arg, evaluate(args[i], env)]).concat(env)
          ),
    ],
    // ['label', ([name, func], env) => [...env, [name, evaluate(func, env)]]],
    [
      'defun',
      ([name, args, body], env) => [
        ...env,
        [name, evaluate(['lambda', args, body], env)],
      ],
    ],
    ['list', (args, env) => args.map((a) => evaluate(a, env))],
  ];

  // takes an array of expressions, returns the value of the last one. The ones before it can only be defuns
  return (exprs) =>
    exprs.reduce((env, line) => evaluate(line, env), defaultEnv);
})();

// const defunFunc = `
// (label defun (lambda (name args body)
//                 (label name (lambda args body))))

// `;

const nullFunc = `
(defun null. (x) (eq x '()))

`;
const andFunc = `  
(defun and. (x y)
  (cond (x (cond (y 't) ('t '())))
    ('t '())))

`;
const notFunc = `      
(defun not. (x)
  (cond (x '())
    ('t 't)))

`;
const appendFunc = `      
(defun append. (x y)
  (cond ((null. x) y)
    ('t (cons (car x) (append. (cdr x) y)))))

`;
const pairFunc = `      
(defun pair. (x y)
  (cond ((and. (null. x) (null. y)) '())
        ((and. (not. (atom x)) (not. (atom y)))
          (cons (list (car x) (car y))
                (pair. (cdr x) (cdr y))))))

`;
const caarFunc = `                 
(defun caar (x)
  (car (car x)))

`;
const cadarFunc = `    
(defun cadar (x)
  (car (cdr (car x))))

`;
const assocFunc = `    
(defun assoc. (x y)
  (cond ((eq (caar y) x) (cadar y))
        ('t (assoc. x (cdr y)))))

`;
const evalFunc =
  assocFunc +
  caarFunc +
  appendFunc +
  pairFunc +
  cadarFunc +
  nullFunc +
  andFunc +
  notFunc +
  `              
(defun cadr (x)
  (car (cdr x)))

(defun caddr (x)
  (car (cdr (cdr x))))
  
(defun caddar (x)
  (car (cdr (cdr (car x)))))

(defun eval. (e a)
  (cond
    ((atom e) (assoc. e a))
    ((atom (car e))
      (cond
        ((eq (car e) 'quote) (cadr e))
        ((eq (car e) 'atom) (atom (eval. (cadr e) a)))
        ((eq (car e) 'eq)   (eq   (eval. (cadr e) a)
                                  (eval. (caddr e) a)))
        ((eq (car e) 'car)  (car  (eval. (cadr e) a)))
        ((eq (car e) 'cdr)  (cdr  (eval. (cadr e) a)))
        ((eq (car e) 'cons) (cons (eval. (cadr e) a)
                                  (eval. (caddr e) a)))
        ((eq (car e) 'cond) (evcon. (cdr e) a))
        ('t (eval. (cons (assoc. (car e) a)
                          (cdr e))
                    a))))
    ((eq (caar e) 'label)
      (eval. (cons (caddar e) (cdr e))
            (cons (list (cadar e) (car e)) a )))
    ((eq (caar e) 'lambda)
      (eval. (caddar e)
            (append. (pair. (cadar e) (evlis. (cdr e) a))
                      a)))))

(defun evcon. (c a)
  (cond ((eval. (caar c) a)
        (eval. (cadar c) a))
        ('t (evcon. (cdr c) a))))

(defun evlis. (m a)
  (cond ((null. m) '())
        ('t (cons (eval.  (car m) a)
                  (evlis. (cdr m) a)))))

`;

const tests = [
  ['(quote a)', 'a', 'quote returns its first argument as a literal'],
  ["'a", 'a', 'quote shorthand'],
  [
    '(quote (a b c))',
    ['a', 'b', 'c'],
    'quote returns its first argument without executing it',
  ],
  ["(atom 'a)", 't', 'atom returns t if its argument is a literal'],
  [
    "(atom '(a b c))",
    [],
    'atom returns an empty list (false) if its argument is a list that is not empty',
  ],
  ["(atom '())", 't', 'atom returns t for an empty list'],
  ["(atom (atom 'a))", 't', 'atom returns t if its argument is t'],
  [
    "(atom '(atom 'a))",
    [],
    'atom returns () if its argument is a non-empty list',
  ],
  ["(eq 'a 'a)", 't', 'eq returns t if its two arguments are the same atom'],
  ["(eq 'a 'b)", [], 'eq returns () if its arguments are different'],
  ["(eq '() '())", 't', 'eq returns t if its arguments are both empty lists'],
  ["(car '(a b c))", 'a', 'car returns the first element of a list'],
  ["(cdr '(a b c))", ['b', 'c'], 'cdr returns the tail of a list'],
  [
    "(cons 'a '(b c))",
    ['a', 'b', 'c'],
    'cons prepends its first argument to its second argument',
  ],
  [
    "(cons 'a (cons 'b (cons 'c '())))",
    ['a', 'b', 'c'],
    'cons prepends its first argument to its second argument',
  ],
  ["(car (cons 'a '(b c)))", 'a', ''],
  ["(cdr (cons 'a '(b c)))", ['b', 'c'], ''],
  [
    "(cond ((eq 'a 'b) 'first) ((atom 'a) 'second))",
    'second',
    'cond takes a list of pairs, finds the first pair whose first item is truthy, returns its second item',
  ],
  [
    "((lambda (x) (cons x '(b))) 'a)",
    ['a', 'b'],
    'lambda defines a function. Its first argument is a list of argument names, its second argument is an expression, and it can be immediately invoked',
  ],
  ["((lambda (x y) (cons x (cdr y))) 'z '(a b c))", ['z', 'b', 'c'], ''],
  ["((lambda (f) (f '(b c))) (lambda (x) (cons 'a x)))", ['a', 'b', 'c'], ''], // Paul's paper has the second lambda quoted, but that doesn't make sense
  // ["(subst 'm 'm '(a b (a b c) d))"],
  [
    nullFunc + "(null. 'a)",
    [],
    'defun adds a new function to the environment. Its first argument is a name (can contain any characters except space, quotes, or parens), its second argument is a list of arg names, and its third is an expression',
  ],
  [nullFunc + "(null. '())", 't'],
  [andFunc + "(and. (atom 'a) (eq 'a 'a))", 't'],
  [andFunc + "(and. (atom 'a) (eq 'a 'b))", []],
  [notFunc + "(not. (eq 'a 'a))", []],
  [notFunc + "(not. (eq 'a 'b))", 't'],
  [nullFunc + appendFunc + "(append. '(a b) '(c d))", ['a', 'b', 'c', 'd']],
  [nullFunc + appendFunc + "(append. '() '(c d))", ['c', 'd']],
  [
    andFunc + nullFunc + notFunc + pairFunc + "(pair. '(x y z) '(a b c))",
    [
      ['x', 'a'],
      ['y', 'b'],
      ['z', 'c'],
    ],
  ],
  [caarFunc + cadarFunc + assocFunc + "(assoc. 'x '((x a) (y b)))", 'a'],
  [
    caarFunc + cadarFunc + assocFunc + "(assoc. 'x '((x new) (x a) (y b)))",
    'new',
  ],
  [
    evalFunc + "(eval. 'x '((x a) (y b)))",
    'a',
    'With just a handful or relatively small functions, we can write a function that can fully execute this language.',
  ],
  [evalFunc + "(eval. '(eq 'a 'a) '())", 't'],
  [evalFunc + "(eval. '(cons x '(b c)) '((x a) (y b)))", ['a', 'b', 'c']],
  [
    evalFunc + "(eval. '(cond ((atom x) 'atom) ('t 'list)) '((x '(a b))))",
    'list',
  ],
  [
    evalFunc + "(eval. '(f '(b c)) '((f (lambda (x) (cons 'a x)))))",
    ['a', 'b', 'c'],
  ],
  [
    evalFunc +
      "(eval. '((lambda (x) (cons 'a x)) '(b c)) '((f (lambda (x) (cons 'a x)))))",
    ['a', 'b', 'c'],
  ],
  [
    evalFunc + "(eval. '((lambda (x y) (cons x (cdr y))) 'a '(b c d)) '())",
    ['a', 'c', 'd'],
  ],
];

const exec = (str) => {
  try {
    return execute(parse(str));
  } catch (e) {
    return e.message;
  }
};

document.querySelector('#root').innerHTML = tests
  .map(([input, expected, desc = ''], i) => {
    const actual = exec(input);
    if (JSON.stringify(actual) === JSON.stringify(expected))
      console.log('PASS');
    else console.error('For', input, 'Expected', expected, 'got', actual);
    return `
    <div class="container">
      <p>${desc}</p>
      <textarea data-id="${i}">${input.trim()}</textarea>
      <div>><span id="result-${i}" class="result">${actual}</span></div>
    </div>
  `;
  })
  .join('');

const formatOutput = (val) =>
  Array.isArray(val) ? `(${val.map(formatOutput).join(' ')})` : val;

document.querySelectorAll('textarea').forEach((target) => {
  const handler = () => {
    target.style.height = '1px';
    target.style.height = 5 + target.scrollHeight + 'px';
    document.querySelector(`#result-${target.dataset.id}`).innerHTML =
      target.value ? formatOutput(exec(target.value)) : '';
  };
  target.addEventListener('input', handler);
  handler();
});
