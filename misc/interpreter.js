const tokenTypes = [
  {regex: /^'([^']*)'/},
  {regex: /^[a-z_]+/i},
  {regex: /^\s+/, ignore: true},
  {regex: /^,/, ignore: true},
  {regex: /^:/, ignore: true},
  {regex: /^-?\d+/, transform: Number}
];

const tokenize = line => {
  const result = [];
  while (line.length) {
    const tokenType = tokenTypes.find(t => t.regex.test(line));
    if (!tokenType) throw new Error(`Unknown token: ${line}`);
    const {regex, transform = x => x, ignore} = tokenType;
    const match = line.match(regex);
    if (!ignore) result.push(transform(match[1] || match[0]));
    line = line.slice(match[0].length);
  }
  return result;
};

class Computer {
  constructor(input) {
    this.instructions = input
      .split('\n')
      .map(line => line.replace(/;.*/, '').trim())
      .filter(i => i)
      .map(tokenize);
    this.inst = 0;
    this.stack = [];
    this.registers = {};
  }
  run() {
    for (let i = 0; i < 1e4 && !this.done; i++) {
      const instruction = this.instructions[this.inst];
      if (!instruction) return -1;

      const [op, ...args] = instruction;
      if (typeof this[op] !== 'function') {
        console.error('Unknown op', op, ...args);
      } else {
        this[op](...args);
      }
      this.inst++;
    }
    return this.output || -1;
  }
  val(value) {
    const r = this.registers[value];
    return r === undefined ? value : r;
  }
  mov(target, value) {
    this.registers[target] = this.val(value);
  }
  inc(target) {
    this.registers[target]++;
  }
  dec(target) {
    this.registers[target]--;
  }
  add(target, value) {
    this.registers[target] += this.val(value);
  }
  sub(target, value) {
    this.registers[target] -= this.val(value);
  }
  mul(target, value) {
    this.registers[target] *= this.val(value);
  }
  div(target, value) {
    this.registers[target] = (this.registers[target] / this.val(value)) | 0;
  }
  jmp(label) {
    this.inst = this.instructions.findIndex(l => l[0] === label);
  }
  cmp(x, y) {
    this.cmpVals = {x: this.val(x), y: this.val(y)};
  }
  jne(label) {
    if (this.cmpVals.x !== this.cmpVals.y) this.jmp(label);
  }
  je(label) {
    if (this.cmpVals.x === this.cmpVals.y) this.jmp(label);
  }
  jge(label) {
    if (this.cmpVals.x >= this.cmpVals.y) this.jmp(label);
  }
  jg(label) {
    if (this.cmpVals.x > this.cmpVals.y) this.jmp(label);
  }
  jle(label) {
    if (this.cmpVals.x <= this.cmpVals.y) this.jmp(label);
  }
  jl(label) {
    if (this.cmpVals.x < this.cmpVals.y) this.jmp(label);
  }
  call(label) {
    this.stack.push(this.inst);
    this.jmp(label);
  }
  ret() {
    this.inst = this.stack.pop();
  }
  msg(...args) {
    this.output = args.map(v => this.val(v)).join('');
  }
  end() {
    this.done = true;
  }
}

const assemblerInterpreter = input => new Computer(input).run();

const program = `mov   a, 2            ; value1
mov   b, 10           ; value2
mov   c, a            ; temp1
mov   d, b            ; temp2
call  proc_func
call  print
end

proc_func:
    cmp   d, 1
    je    continue
    mul   c, a
    dec   d
    call  proc_func

continue:
    ret

print:
    msg a, '^', b, ' = ', c
    ret`;

console.log(assemblerInterpreter(program));
