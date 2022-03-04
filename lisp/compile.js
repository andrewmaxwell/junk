// const compile = (str) => str;

// const {Test} = require('../misc/test');

// const tests = [
//   ['(+ 1 2)', [1, 3, 'add']],
//   ['(+ (8 / 4) 7', '8 4 div 7 add'],
//   ['(eq 3 4)', '3 4 eq'],
//   ["(car '(a b c))", 'c b cons a cons car'],
// ];

const resolveLabels = (lines) => {
  const labels = {};
  const resolveLabel = (name) => {
    if (name in labels) return labels[name];
    throw new Error(`Invalid label "${name}"`);
  };
  return lines
    .reduce((res, line) => {
      if (line[0] === 'label') labels[line[1]] = res.length;
      else res.push(line);
      return res;
    }, [])
    .map((line) =>
      line[0] === 'jmp'
        ? ['jmp', resolveLabel(line[1]), '//', line[1]]
        : line[0] === 'jp0'
        ? ['jp0', line[1], resolveLabel(line[2]), '//', line[2]]
        : line
    );
};

const ops = {
  set: ([target, value], env) => {
    env.mem[target] = Number(value);
  },
  add: ([target, value], env) => {
    env.mem[target] += Number(value);
  },
  jmp: ([value], env) => {
    env.inst = Number(value) - 1;
  },
  jp0: ([target, lineNum], env) => {
    if (!env.mem[target]) env.inst = lineNum - 1;
  },
  out: ([value], env) => {
    env.output += String.fromCharCode(env.mem[value]);
  },
  drf: ([target, source], env) => {
    env.mem[target] = env.mem[env.mem[source]];
  },
};

const run = (asm, debug) => {
  const code = resolveLabels(
    asm
      .split('\n')
      .filter((s) => s.replace(/\/\/.*/g, '').trim())
      .map((s) => s.trim().split(/\s+/))
  );

  const env = {inst: 0, mem: [], output: ''};
  for (let x = 0; x < 50 && code[env.inst]; x++) {
    const [op, ...args] = code[env.inst];
    if (!ops[op]) throw new Error(`wtf is ${op}?!`);
    ops[op](args, env);
    if (debug) console.log(op, ...args, env);
    env.inst++;
  }
  return env.output;
};

import {Test} from '../misc/test.js';
Test.assertDeepEquals(
  run(`
set 1 4
set 2 3 // location of next link

set 3 5
set 4 5 // location of next link

set 5 6
set 6 0 // end of list

set 7 1 // location of first link
jmp printList

label printList
set 8 40  // (
out 8
jmp printInner
label donePrintInner
set 8 41   // )
out 8
jmp donePrintList

label printInner
jp0 7 donePrintInner // if the value at 7 is 0, jump to the end
drf 8 7 // put the value that 7 points to in 8
add 8 48 // convert number to ascii
out 8 // output it (the value of the link)
add 7 1 // increment pointer to point at location of next link
drf 7 7 // dereference the value there
jp0 7 donePrintInner // if the value at 7 is 0, jump to the end
set 8 32 // space
out 8
jmp printInner // loop

label donePrintList
`),
  '(4 5 6)'
);

/*

(defun append (x y)
  (cond
    (x (cons (car x) (append. (cdr x) y))) 
    ((null. x) y)
    ('t (cons (car x) (append. (cdr x) y)))))

(append. '(a b) '(c d))

*/
run(`

`);
