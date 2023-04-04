// takes an array of assembly tokens (strings) and runs them on a simple, simulated CPU. The values of the variables are returned.
export const runAsm = (program) => {
  const vars = {};
  const stack = [];
  let pc = 0;
  while (pc < program.length) {
    const op = program[pc++];
    if (op === 'FETCH') stack.push(vars[program[pc++]] || 0);
    else if (op === 'STORE') vars[program[pc++]] = stack[stack.length - 1];
    else if (op === 'PUSH') stack.push(program[pc++]);
    else if (op === 'POP') stack.pop();
    else if (op === 'ADD') stack.push(stack.pop() + stack.pop());
    else if (op === 'SUB') stack.push(-stack.pop() + stack.pop());
    else if (op === 'LT') stack.push(-stack.pop() + stack.pop() < 0 ? 1 : 0);
    else if (op === 'JMP') pc += program[pc];
    else if (op === 'JZ') pc += stack.pop() ? 1 : program[pc];
    else if (op === 'JNZ') pc += stack.pop() ? program[pc] : 1;
  }
  return vars;
};
