const binaryOps = {
  ADD: (a, b) => a + b,
  SUB: (a, b) => a - b,
  MULT: (a, b) => a * b,
  DIV: (a, b) => a / b,
  MOD: (a, b) => a % b,
  AND: (a, b) => (a && b ? 1 : 0),
  OR: (a, b) => (a || b ? 1 : 0),
  LT: (a, b) => (a < b ? 1 : 0),
  LTE: (a, b) => (a <= b ? 1 : 0),
  GT: (a, b) => (a > b ? 1 : 0),
  GTE: (a, b) => (a >= b ? 1 : 0),
  EQ: (a, b) => (a == b ? 1 : 0),
  NEQ: (a, b) => (a != b ? 1 : 0),
};

// takes an array of assembly tokens (strings) and runs them on a simple, simulated CPU. The values of the variables are returned.
export const runAsm = (program) => {
  // console.log('program', program);
  const vars = {};
  const stack = [];
  let pc = 0;
  let output = '';

  while (pc < program.length) {
    const op = program[pc++];
    if (binaryOps[op]) {
      const b = stack.pop();
      const a = stack.pop();
      stack.push(binaryOps[op](a, b));
    } else if (op === 'FETCH') stack.push(vars[program[pc++]] || 0);
    else if (op === 'STORE') vars[program[pc++]] = stack[stack.length - 1];
    else if (op === 'PUSH') stack.push(program[pc++]);
    else if (op === 'POP') stack.pop();
    else if (op === 'NOT') stack.push(stack.pop() ? 0 : 1);
    else if (op === 'JMP') pc += program[pc];
    else if (op === 'JZ') pc += stack.pop() ? 1 : program[pc];
    else if (op === 'JNZ') pc += stack.pop() ? program[pc] : 1;
    else if (op === 'PRINT') output += stack.pop();
    else throw new Error(`RUN ERROR: wtf is ${op}`);
  }
  return output;
};
