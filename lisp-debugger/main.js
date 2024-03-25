import {defaultEnv, execute} from '../lisp/execute.js';
import {parse} from '../lisp/parse.js';

const textarea = document.querySelector('textarea');

let frame = 0;
let steps;

const formatEnv = (env) => {
  const envObj = Object.fromEntries(env.toReversed());
  for (const [key] of defaultEnv) delete envObj[key];
  return Object.entries(envObj)
    .map(([key, val]) => {
      val = typeof val === 'function' ? val.lisp : JSON.stringify(val);
      return `${key} -> ${val}`;
    })
    .join('\n');
};

const update = () => {
  const {loc, env, stack, result} = steps[frame];

  document.querySelector('#env').innerText = [
    ...(result ? [result] : []),
    `Values:\n${formatEnv(env)}`,
    `Stack trace:\n${stack.join('\n')}`,
  ].join('\n\n');

  document.querySelector('#counter').innerText = `${frame + 1}/${steps.length}`;

  const [row, col] = loc.split(':').map(Number);

  const lines = textarea.value.split('\n');
  let start = col;
  for (let i = 0; i < row; i++) start += lines[i].length + 1;
  const len =
    textarea.value.slice(start).match(/^[^\s|(|)]+/g)?.[0].length ?? 0;
  textarea.focus();
  textarea.setSelectionRange(start, start + len);
};

const toLisp = (val) =>
  Array.isArray(val) ? `(${val.map(toLisp).join(' ')})` : val;

const changeCode = () => {
  const r = execute(parse(textarea.value));
  steps = r.steps;
  document.querySelector('#result').innerText = `Program Output: ${toLisp(
    r.result
  )}`;
  frame = 0;
  console.log('steps', steps);
};

textarea.addEventListener('input', changeCode);

document.querySelector('#toStart').addEventListener('click', () => {
  frame = 0;
  update();
});

document.querySelector('#back').addEventListener('click', () => {
  frame = (frame - 1 + steps.length) % steps.length;
  update();
});

document.querySelector('#forward').addEventListener('click', () => {
  frame = (frame + 1) % steps.length;
  update();
});

document.querySelector('#toEnd').addEventListener('click', () => {
  frame = steps.length - 1;
  update();
});

textarea.value = `(defun divisibleBy (x d) (eq 0 (% x d)))

(defun fb (curr) 
  (cond
    ((divisibleBy curr 15) 'FizzBuzz)
    ((divisibleBy curr 5) 'Buzz)
    ((divisibleBy curr 3) 'Fizz)
    ('t curr)
  )
)

(defun fizzbuzz (curr max)
  (cond 
    ((> curr max) "")
    ('t (+ (fb curr) " " (fizzbuzz (+ 1 curr) max)))
  )
)

(fizzbuzz 1 100)`;
changeCode();
update();
