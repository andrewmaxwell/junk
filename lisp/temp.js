const set = (index, val, arr) => {
  const copy = [...arr];
  copy[index] = val;
  return copy;
};

const addToIndex = (arr, index, val) =>
  set(index, (arr[index] || 0) + val, arr);

const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === '[') indexes.push(result.length);
    else result.push(t === ']' ? result.splice(indexes.pop()) : t); // I'm a bad person
  }
  return result;
};

const execNode = (env, node) => {
  if (Array.isArray(node)) {
    return env.data[env.dataPtr]
      ? execNode(node.reduce(execNode, env), node)
      : env;
  }

  const {input, data, dataPtr, output} = env;
  if (node === '>') return {...env, dataPtr: dataPtr + 1};
  if (node === '<') return {...env, dataPtr: dataPtr - 1};
  if (node === '+') return {...env, data: addToIndex(data, dataPtr, 1)};
  if (node === '-') return {...env, data: addToIndex(data, dataPtr, -1)};
  if (node === '.')
    return {...env, output: output + String.fromCharCode(data[dataPtr])};
  if (node === ',')
    return {...env, input: input.slice(1), data: set(dataPtr, input[0], data)};
  return env;
};

const brainfuck = (program, input) =>
  nest(program).reduce(execNode, {input, data: [], dataPtr: 0, output: ''});

const result = brainfuck(
  '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.'
);

console.log(result);

/*
(defun getIndex (arr i)
  (cond
    (i (getIndex (cdr arr) (- i 1)))
    ('t (car arr))))

(defun setIndex (arr index val)
  (cond
    (index (cons (car arr) (setIndex (cdr arr) (- index 1) val)))
    ('t (cons val (cdr arr)))))

(defun or (a b)
  (cond (a a) ('t b)))

(defun addToIndex (arr index val)
  (setIndex arr index (+ (or (getIndex arr index) 0) val)))

(defun getCurrentData (env)
  (getIndex (getIndex env 1) (getIndex env 2)))

(defun addToData (env val)
  (setIndex env 2 (addToIndex (getIndex env 2) (getCurrentData env) val)))

(defun addToOutput (env)
  (setIndex env 3 (+ (getIndex env 3) (numToChar (getCurrentData env)))))

(defun execInst (env inst)
  (cond
    ((eq inst '>') (addToIndex env 2 1))
    ((eq inst '<') (addToIndex env 2 -1))
    ((eq inst '+') (addToData env 1))
    ((eq inst '-') (addToData env -1))
    ((eq inst '.') (addToOutput env))
    ((eq inst ','))
  )
)



(defun execNode (env node)
  (cond
    (isAtom (execInst env node))
    ((getCurrentData env) (execNode (reduce execNode env node) node))
    ('t env)))

(defun brainfuck (program input)
  (reduce execNode (list input '() 0 '') (nest program))

(brainfuck '++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.')

*/
