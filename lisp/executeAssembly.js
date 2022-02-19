const parseAsm = (str) => {
  const labels = {};
  const instructions = [];
  for (const line of str.trim().split('\n')) {
    const t = line.trim();
    if (t.endsWith(':')) labels[t.slice(0, -1)] = instructions.length;
    else if (t)
      instructions.push(t.split(' ').map((v) => (isNaN(v) ? v : Number(v))));
  }
  return {labels, instructions};
};

const execute = (str) => {
  const {labels, instructions} = parseAsm(str);
  const dataStack = [];
  const callStack = [];
  const output = [];

  for (let inst = 0; inst < instructions.length; inst++) {
    console.log(...instructions[inst]);

    const [op, a] = instructions[inst];
    if (op === 'push') dataStack.push(a);
    else if (op === 'print') output.push(dataStack.pop());
    else if (op === 'exit') return output.join('\n');
    else if (op === 'copy') dataStack.push(dataStack[dataStack.length - 1]);
    else if (op === 'return') inst = callStack.pop();
    else if (op === 'mult') dataStack.push(dataStack.pop() * dataStack.pop());
    else if (op === 'sub') {
      const b = dataStack.pop();
      const a = dataStack.pop();
      dataStack.push(a - b);
    } else if (op === 'gt') {
      const b = dataStack.pop();
      const a = dataStack.pop();
      dataStack.push(Number(a > b));
    } else if (op === 'jmpc') {
      if (dataStack.pop()) inst = labels[a] - 1;
    } else if (op === 'call') {
      callStack.push(inst);
      inst = labels[a] - 1;
    } else throw new Error(`wtf if ${op}`);

    console.log(dataStack);
  }

  throw new Error('Program did not call "exit" to terminate');
};

/*

(defun factorial (x)
  (cond
    ((> x 1)  (* x (factorial (- x 1))))
    ('t 1)))

(factorial 10)
*/
const res = execute(`
push 10
call factorial
print
exit

factorial:
copy
push 1
gt
jmpc factorial1
push 1
mult
return

factorial1:
copy
push 1
sub
call factorial
mult
return
`);

import {Test} from '../misc/test.js';
Test.assertDeepEquals(res, '3628800');
