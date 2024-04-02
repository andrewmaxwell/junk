const splitIntoTwo = (str) => {
  const i = str.indexOf(' ');
  return i === -1 ? [str] : [str.slice(0, i), str.slice(i + 1)];
};

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

export const runAsm = (program) => {
  let vars = {};
  const callStack = [];
  const stack = [];
  let pc = 0;
  let output = '';

  for (let i = 0; i < 10000 && pc < program.length; i++) {
    // console.log(program[pc], vars);
    const [op, arg] = splitIntoTwo(program[pc++].replace(/\/\/.*/, '').trim());
    if (binaryOps[op]) {
      const b = stack.pop();
      const a = stack.pop();
      stack.push(binaryOps[op](a, b));
    } else if (op === 'FETCH') stack.push(vars[arg] || 0);
    else if (op === 'STORE') vars[arg] = stack[stack.length - 1];
    else if (op === 'PUSH') stack.push(+arg);
    else if (op === 'POP') stack.pop();
    else if (op === 'NOT') stack.push(stack.pop() ? 0 : 1);
    else if (op === 'JMP') pc += +arg;
    else if (op === 'JZ') pc += stack.pop() ? 0 : +arg;
    else if (op === 'JNZ') pc += stack.pop() ? +arg : 0;
    else if (op === 'PRINTN') output += stack.pop();
    else if (op === 'PRINTC') output += String.fromCharCode(arg);
    else if (op === 'CALL') {
      callStack.push(vars);
      vars = {_ret: pc};
      pc += +arg;
    } else if (op === 'RETURN') {
      pc = vars._ret;
      vars = callStack.pop();
    } else throw new Error(`RUN ERROR: wtf is ${op}`);
  }
  return output;
};
