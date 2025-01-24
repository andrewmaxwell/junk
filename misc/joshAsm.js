const DEBUG = false;

class Memory {
  constructor() {
    this.data = [0];
  }
  get(index) {
    return this.data[index];
  }
  set(index, value) {
    this.data[index] = value;
  }
  push(value) {
    this.data.push(value);
  }
  pop() {
    this.data.pop();
  }
  inc(index) {
    this.data[index]++;
  }
}

const toMathInstructions = (obj) => {
  for (const key in obj) {
    const func = obj[key];
    obj[key] = (memory, x, y) =>
      memory.push(func(memory.get(x), memory.get(y)));
  }
  return obj;
};

const toBranchInstructions = (obj) => {
  for (const key in obj) {
    const func = obj[key];
    obj[key] = (memory, x, y, z) => {
      if (func(memory.get(x), memory.get(y))) memory.set(0, z - 2);
    };
  }
  return obj;
};

const ops = {
  // STORE: (memory, val, loc) => (memory[loc] = val),
  PUSH: (memory, val) => memory.push(val),
  MOVE: (memory, loc, dest) => memory.set(dest, memory.get(loc)),
  POP: (memory) => memory.pop(),
  ...toMathInstructions({
    ADD: (a, b) => a + b,
    SUB: (a, b) => a - b,
    MUL: (a, b) => a * b,
    DIV: (a, b) => a / b,
    MOD: (a, b) => a % b,
    AND: (a, b) => a & b,
    OR: (a, b) => a | b,
    SHR: (a, b) => a >> b,
    SHL: (a, b) => a << b,
    EQ: (a, b) => a === b,
    NEQ: (a, b) => a !== b,
    GT: (a, b) => a > b,
    GTE: (a, b) => a >= b,
    LT: (a, b) => a < b,
    LTE: (a, b) => a <= b,
  }),
  PRINT: (memory, val) => console.log(memory.get(val)),
  ...toBranchInstructions({
    BEQ: (a, b) => a == b,
    BNEQ: (a, b) => a != b,
    BLT: (a, b) => a < b,
    BGT: (a, b) => a > b,
    BLTE: (a, b) => a <= b,
    BGTE: (a, b) => a >= b,
  }),
  JUMP: (memory, val) => memory.set(0, val - 2),
};

const preprocess = (code) => {
  const labels = {};
  const lines = [];
  let lineNumber = 0;
  for (const line of code.split('\n')) {
    const trimmed = line.replace(/\/\/.*/, '').trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      labels[trimmed] = lineNumber + 1;
    } else if (trimmed.startsWith('$')) {
      const [label, value] = trimmed
        .split(/\s*=\s*/g)
        .map((t) => (isNaN(t) ? t : +t));
      lines[lineNumber++] = ['PUSH', value];
      labels[label] = lineNumber;
    } else {
      lines[lineNumber++] = trimmed
        .split(/\s+/g)
        .map((t) => (isNaN(t) ? t : +t));
    }
  }

  if (DEBUG) {
    console.log('labels', labels);
  }

  return lines.map((line) => line.map((arg) => labels[arg] || arg));
};

const execute = (code) => {
  const memory = new Memory();
  const instructions = preprocess(code);
  if (DEBUG) {
    console.log(
      'preprocessed',
      instructions.map((line) => line.join(' ')).join('\n')
    );
    console.log('>>>>>> PROGRAM EXECUTION');
  }
  while (memory.get(0) < instructions.length) {
    // if (DEBUG) console.log('>>> DEBUG ', memory[0], instructions[memory[0]]);
    const [command, ...args] = instructions[memory.get(0)];
    ops[command](memory, ...args);
    memory.inc(0);
  }
};

execute(`
// push some starting values onto the stack
$currentNumber = 1
$one = 1
$zero = 0
$max = 30
$three = 3
$five = 5
$fifteen = 15
$fizz = FIZZ
$buzz = BUZZ
$fizzbuzz = FIZZBUZZ
$result = 0

#STARTLOOP 

// if current value > 100, exit
BGT $currentNumber $max #END 

// if current value is divisible by 15, print FIZZBUZZ
POP
MOD $currentNumber $fifteen 
BNEQ $result $zero #BUZZ
PRINT $fizzbuzz 
JUMP #INCREMENT

#BUZZ
POP
MOD $currentNumber $five 
BNEQ $result $zero #FIZZ
PRINT $buzz
JUMP #INCREMENT

#FIZZ
POP
MOD $currentNumber $three 
BNEQ $result $zero #NUMBER
PRINT $fizz
JUMP #INCREMENT

#NUMBER
PRINT $currentNumber

#INCREMENT
POP
ADD $currentNumber $one
MOVE $result $currentNumber
JUMP #STARTLOOP

#END`);
