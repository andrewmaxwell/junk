import {parse} from './parse.js';
import {execute} from './execute.js';

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
            (cons (list (cadar e) (car e)) a)))
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

const reduce = `
(defun reduce (func acc arr) 
  (cond (arr (reduce func (func acc (car arr)) (cdr arr))) 
    ('t acc)))

`;

const filter = `
(defun filter (pred arr)
  (cond (arr 
      (cond ((pred (car arr)) (cons (car arr) (filter pred (cdr arr))))
        ('t (filter pred (cdr arr)))))
    ('t arr)))

`;

const map = `
(defun map (func arr)
  (cond (arr (cons (func (car arr)) (map func (cdr arr))))
    ('t arr)))

(map car '((a b) (c d) (e f)))
`;

const mergeSort = `
(defun and (x y)
  (cond (x (cond (y y) ('t '()))) ('t '())))

(defun take (n arr)
  (cond
    (n (cons (car arr) (take (- n 1) (cdr arr))))
    ('t '())))

(defun drop (n arr)
  (cond
    (n (drop (- n 1) (cdr arr)))
    ('t arr)))

(defun length (arr)
  (cond
    (arr (+ 1 (length (cdr arr))))
    ('t 0)))

(defun halfLength (arr)
  (floor (/ (length arr) 2)))

(defun merge (a b)
  (cond
    ((and a b)
      (cond
        ((< (car a) (car b)) 
          (cons (car a) (merge (cdr a) b)))
        ('t 
          (cons (car b) (merge a (cdr b))))))
    (a a)
    ('t b)))

(defun mergeSort (arr)
  (cond
    ((cdr arr)
      (merge
        (mergeSort (take (halfLength arr) arr))
        (mergeSort (drop (halfLength arr) arr))))
    ('t arr)))

`;

const binaryTree = `
(defun getProp (name obj)
  (cond
    (obj (cond
      ((eq name (car (car obj))) (car (cdr (car obj))))
      ('t (getProp name (cdr obj)))))
    ('t '())))

(defun deleteProp (name obj)
  (cond
    (obj (cond 
      ((eq name (car (car obj))) (cdr obj))
      ('t (cons (car obj) (deleteProp name (cdr obj))))))
    ('t '())))

(defun setProp (name value obj)
  (cons 
    (list name value) 
    (deleteProp name obj)))

(defun addTo (tree name value) 
  (setProp name (addNode (getProp name tree) value) tree))

(defun addNode (tree value)
  (cond 
    (tree (cond
      ((< value (getProp 'value tree)) (addTo tree 'left value))
      ('t (addTo tree 'right value))))
    ('t (list (list 'value value)))))

(defun buildTree (arr) (reduce addNode '() arr))

`;

const mazeSolver = `
(defun and (x y)
  (cond (x (cond (y y) ('t '()))) ('t '())))

(defun or (x y)
  (cond (x x) (y y) ('t '())))

(defun not (x)
  (cond (x '()) ('t 't)))

(defun includes (arr el)
  (cond
    (arr (or
      (eq (car arr) el)
      (includes (cdr arr) el)))
    ('t '())))

(defun getIndex (arr i)
  (cond
    (arr (cond
      (i (getIndex (cdr arr) (- i 1)))
      ('t (car arr))))
    ('t '())))

(defun getValAtCoords (grid coord)
  (getIndex 
    (getIndex grid (car (cdr coord)))
    (car coord)))

(defun exploreDir (maze path end dx dy)
  (solveMazeRecursive 
    maze 
    (cons 
      (list 
        (+ (car (car path)) dx) 
        (+ (car (cdr (car path))) dy)) 
      path)
    end))

(defun solveMazeRecursive (maze path end)
  (cond
    ((eq (car path) end) path)
    (
      (and 
        (eq 1 (getValAtCoords maze (car path)))
        (not (includes (cdr path) (car path))))
      (or
        (or
          (exploreDir maze path end 1 0)
          (exploreDir maze path end 0 1))
        (or
          (exploreDir maze path end -1 0)
          (exploreDir maze path end 0 -1))))
    ('t '())))

(defun solveMaze (maze start end)
  (solveMazeRecursive maze (list end) start))

(solveMaze 
  '(
    (1 1 0 0 0 0 0)
    (0 1 0 1 1 1 0)
    (0 1 1 1 0 1 0)
    (0 0 0 1 0 0 0)
    (0 1 0 1 1 1 0)
    (0 1 1 1 0 0 0)
    (0 0 0 1 1 1 0)
    (0 1 1 1 0 1 0)
    (0 0 0 0 0 1 1))
  '(0 0)
  '(6 8))

`;

const nester = `
(defun and (x y)
  (cond (x (cond (y y) ('t '()))) ('t '())))

(defun take (n arr)
  (cond
    (n (cons (car arr) (take (- n 1) (cdr arr))))
    ('t '())))

(defun drop (n arr)
  (cond
    (n (drop (- n 1) (cdr arr)))
    ('t arr)))

(defun getIndexOfClose (str index depth)
  (cond
    ((and (eq '] (car str)) (eq 0 depth)) index)
    ('t (getIndexOfClose
      (cdr str)
      (+ 1 index)
      (+ depth (cond
        ((eq '[ (car str)) 1)
        ((eq '] (car str)) -1)
        ('t 0)))))))

(defun nestDeeper (arr index)
  (cons
    (nest (take index arr))
    (nest (drop (+ index 1) arr))))

(defun nest (str) 
  (cond
    ((eq '[ (car str)) 
      (nestDeeper (cdr str) (getIndexOfClose (cdr str) 0 0)))
    ((car str) (cons (car str) (nest (cdr str))))
    ('t '())))

`;

const transpileToJS = `

(defun map (func arr)
  (cond (arr (cons (func (car arr)) (map func (cdr arr))))
    ('t arr)))

(defun join (d arr)
  (cond
    ((cdr arr) (+ (car arr) d (join d (cdr arr))))
    ('t arr)))

(defun printData (data)
  (cond
    ((atom data) (+ "'" data "'"))
    ('t (+ "[" (join ", " (map printData data)) "]"))))

(defun cadr (x) (car (cdr x)))
(defun caddr (x) (car (cdr (cdr x))))
(defun defunToJS (args) (+ 
  "const " 
  (car args) 
  " = (" 
  (join ", " (cadr args))
  ") => " 
  (toJS (caddr args))))

(defun pairToJS (args) (+ "isTruthy(" (toJS (car args)) ") ? " (toJS (cadr args))))
(defun condToJS (args) (+ (join " : " (map pairToJS args)) " : []"))
(defun consToJS (args) (+ "[" (toJS (car args)) ", ..." (toJS (cadr args)) "]"))
(defun carToJS (args) (+ (toJS (car args)) "[0]"))
(defun cdrToJS (args) (+ (toJS (car args)) ".slice(1)"))
(defun quoteToJS (args) (printData (car args)))
(defun atomToJS (args) (+ "!" (toJS (car args)) "?.length"))
(defun plusToJS (args) (join " + " (map toJS args)))
(defun eqToJS (args) (join " == " (map toJS args)))
(defun listToJS (args) (+ "[" (join ", " (map toJS args)) "]"))

(defun getFunc (name)
  (cond
    ((eq name 'defun) defunToJS)
    ((eq name 'cond) condToJS)
    ((eq name 'cons) consToJS)
    ((eq name 'car) carToJS)
    ((eq name 'cdr) cdrToJS)
    ((eq name 'quote) quoteToJS)
    ((eq name 'atom) atomToJS)
    ((eq name '+) plusToJS)
    ((eq name 'eq) eqToJS)
    ((eq name 'list) listToJS)
    ('t '())
  )
)

(defun toJS (code)
  (cond
    ((getFunc code) (+ "(x) => " (toJS (list code 'x))))
    ((atom code) code)
    ((getFunc (car code)) ((getFunc (car code)) (cdr code)))
    ('t (+ (toJS (car code)) "(" (join ", " (map toJS (cdr code))) ")"))
  )
)

(defun transpileToJS (code) 
  (+ 
    "const isTruthy = (x) => x && (!Array.isArray(x) || x.length);\\n" 
    (join ";\\n" (map toJS code))))
    
(transpileToJS '(
  (defun map (func arr)
    (cond (arr (cons (func (car arr)) (map func (cdr arr))))
      ('t arr)))
  (map car '((1 2) (3 4) (5 6)))
))
`;

const macroExample = `
(defun nestOps (r arg) 
  (cons (car arg) (cons r (cdr arg))))

(defmacro -> (args)
  (reduce nestOps (car args) (cdr args))
)

(defun funTime (m)
  (-> m (/ 4) (+ 1) (* m))
)

(funTime 10)
`;

const bf = `
(defun get (arr i)
  (cond
    (i (get (cdr arr) (- i 1)))
    ('t (car arr))))

(defun set (arr i val)
  (cond
    (i (cons (car arr) (set (cdr arr) (- i 1) val)))
    ('t (cons val (cdr arr)))))

(defun or (a b)
  (cond (a a) ('t b)))

(defun getCurrentData (env)
  (or (get (getData env) (getDataPtr env)) 0))

(defun getInput (env) (get env 0))
(defun setInput (env val) (set env 0 val))
(defun consumeInput (env) (setInput env (cdr (getInput env))))
(defun readInput (env)
  (setData env (set (getData env) (getDataPtr env) (car getInput))))

(defun getData (env) (get env 1))
(defun setData (env data) (set env 1 data))
(defun addToCurrentData (env val)
  (setData env (set (getData env) (getDataPtr env) (+ (getCurrentData env) val))))

(defun getDataPtr (env) (get env 2))
(defun setDataPtr (env val) (set env 2 val))
(defun moveDataPtr (env dir) 
  (setDataPtr env (+ (getDataPtr env) dir)))

(defun getOutput (env) (get env 3))
(defun setOutput (env val) (set env 3 val))
(defun appendToOutput (env)
  (setOutput env (+ (getOutput env) (numToChar (getCurrentData env)))))

(defun execInst (env inst)
  (cond
    ((eq inst ">") (moveDataPtr env 1))
    ((eq inst "<") (moveDataPtr env -1))
    ((eq inst "+") (addToCurrentData env 1))
    ((eq inst "-") (addToCurrentData env -1))
    ((eq inst ".") (appendToOutput env))
    ((eq inst ",") (consumeInput (readInput env)))
    ('t env)))

(defun execNode (env node)
  (cond
    ((atom node) (execInst env node))
    ((getCurrentData env) (execNode (reduce execNode env node) node))
    ('t env)))

(defun brainfuck (program input)
  (getOutput (reduce execNode (list input '() 0 "") (nest program))))
  
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
  ["((lambda (f) (f '(b c))) (lambda (x) (cons 'a x)))", ['a', 'b', 'c'], ''],
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
    evalFunc + "(eval. '((lambda (x y) (cons x (cdr y))) 'a '(b c d)) '())",
    ['a', 'c', 'd'],
    'With just a handful of small functions, we can write a function that can fully execute this language.',
  ],
  [
    reduce + macroExample,
    35,
    'Macros are like functions that operate on their arguments before executing them. Here is an implementation of thread-first.',
  ],
  [map, ['a', 'c', 'e'], 'An implementation of map'],
  [reduce + "(reduce + 0 '(9 8 7))", 24, 'An implementation of reduce'],
  [
    filter + "(filter (lambda (x) (> x 5)) '(1 3 4 5 7 9 11 13))",
    [7, 9, 11, 13],
    'An implementation of filter',
  ],
  [
    mergeSort + "(mergeSort '(5 9 1 3 0 8 5 2 3 3 -7 3.14))",
    [-7, 0, 1, 2, 3, 3, 3, 3.14, 5, 5, 8, 9],
    'Merge Sort',
  ],
  [
    reduce + binaryTree + "(buildTree '(5 3 2 1 4 9 6 8 7))",
    [
      [
        'right',
        [
          [
            'left',
            [
              [
                'right',
                [
                  ['left', [['value', 7]]],
                  ['value', 8],
                ],
              ],
              ['value', 6],
            ],
          ],
          ['value', 9],
        ],
      ],
      [
        'left',
        [
          ['right', [['value', 4]]],
          [
            'left',
            [
              ['left', [['value', 1]]],
              ['value', 2],
            ],
          ],
          ['value', 3],
        ],
      ],
      ['value', 5],
    ],
    'Binary Tree',
  ],
  [
    mazeSolver,
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 3],
      [3, 4],
      [3, 5],
      [3, 6],
      [4, 6],
      [5, 6],
      [5, 7],
      [5, 8],
      [6, 8],
    ],
    'Maze Solver',
  ],
  [
    nester + "(nest 'a[b[c][d]]e)",
    ['a', ['b', ['c'], ['d']], 'e'],
    'String to nested lists',
  ],
  [
    transpileToJS,
    `const isTruthy = (x) => x && (!Array.isArray(x) || x.length);
const map = (func, arr) => isTruthy(arr) ? [func(arr[0]), ...map(func, arr.slice(1))] : isTruthy('t') ? arr : [];
map((x) => x[0], [['1', '2'], ['3', '4'], ['5', '6']])`,
    'Lisp to JS Transpiler',
  ],
  [
    reduce +
      nester +
      bf +
      '(brainfuck "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++." "")',
    'Hello World!\n',
    'Brainfuck Interpreter',
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
      <div class="result"><span id="result-${i}">${actual}</span></div>
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
