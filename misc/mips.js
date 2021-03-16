const commands = {
  add: (a, b, c) => `${a} = ${b} + ${c}`,
  addi: (a, b, c) => `${a} = ${b} + ${c}`,
  addiu: (a, b, c) => `${a} = ${b} + ${c}`,
  addu: (a, b, c) => `${a} = ${b} + ${c}`,
  and: (a, b, c) => `${a} = ${b} && ${c}`,
  andi: (a, b, c) => `${a} = ${b} && ${c}`,
  beq: (a, b, c) => `if (${a} == ${b}) PC = ${c}`,
  bge: (a, b, c) => `if (${a} >= ${b}) PC = ${c}`,
  bgt: (a, b, c) => `if (${a} > ${b}) PC = ${c}`,
  ble: (a, b, c) => `if (${a} <= ${b}) PC = ${c}`,
  blt: (a, b, c) => `if (${a} < ${b}) PC = ${c}`,
  bne: (a, b, c) => `if (${a} != ${b}) PC = ${c}`,
  div: (a, b) => `hi = ${a} % ${b}; lo = Math.floor(${a} / ${b})`,
  j: (a) => `PC = ${a}`,
  jal: (a) => `$ra = PC; PC = ${a}`,
  jr: (a) => `PC = ${a}`,
  la: (a, b) => `${a} = ${b}`,
  li: (a, b) => `${a} = ${b}`,
  lw: (a, b) => `${a} = ${b}`,
  mfhi: (a) => `${a} = hi`,
  mflo: (a) => `${a} = lo`,
  move: (a, b) => `${a} = ${b}`,
  mult: (a, b) => `lo = ${a} * ${b}`,
  multu: (a, b) => `lo = ${a} * ${b}`,
  nor: (a, b, c) => `${a} = !${b} && !${c}`,
  or: (a, b, c) => `${a} = ${b} || ${c}`,
  ori: (a, b, c) => `${a} = ${b} || ${c}`,
  output: (a) => `console.log(${a})`, // I made this up
  sll: (a, b, c) => `${a} = ${b} << ${c}`,
  slt: (a, b, c) => `${a} = ${b} < ${c} ? 1 : 0`,
  slti: (a, b, c) => `${a} = ${b} < ${c} ? 1 : 0`,
  srl: (a, b, c) => `${a} = ${b} >>> ${c}`,
  sub: (a, b, c) => `${a} = ${b} - ${c}`,
  sw: (a, b) => `${b} = ${a}`,
  syscall: () => `console.log($a0)`, // TODO: learn what else syscall can do
};

const removeCommentsAndTokenize = (line) =>
  line.replace(/#.*/, '').match(/"[^"]*"|[^ ]+/g) || [];

const removeCommas = (el) => (el[0] === '"' ? el : el.replace(/,/g, ''));

const parse = (str) =>
  str
    .replace(/\(/g, '[')
    .replace(/\)/g, '/4]') // hack to handle each value in the array being 4 bytes
    .replace(/\$zero/g, 0)
    .split('\n')
    .map((r) => removeCommentsAndTokenize(r).map(removeCommas))
    .filter((r) => r.toString() && r[0] !== '.align'); // remove .align and blank lines

const mipsToJs = (str) => {
  const data = [];
  const instructions = [];

  let section = null;
  let instCounter = 0;

  for (const row of parse(str)) {
    const [cmd, a, b, c] = row;
    if (cmd[0] === '.') section = null;

    // handle data definitions
    if (section === '.data') {
      if (cmd.slice(-1) === ':') {
        data.push(
          `const ${cmd.slice(0, -1)} = ${
            a === '.space' ? `new Int32Array(${b}/4);` : b + ';'
          }`
        );
      } else {
        data.push(`<<UNKNOWN IN DATA SECTION: ${row.join(' ')}>>`);
      }

      // handle lines that start with a dot
    } else if (cmd[0] === '.') {
      section = cmd;

      // handle labels
    } else if (cmd.slice(-1) === ':') {
      data.push(`const ${cmd.slice(0, -1)} = ${instCounter - 1};`);
      instructions.push('// ' + cmd.slice(0, -1));

      // handle instructions
    } else {
      instructions.push(
        commands[cmd]
          ? `() => {${commands[cmd](a, b, c)}},`
          : `<<UNKNOWN COMMAND: ${row.join(' ')}>>`
      );
      instCounter++;
    }
  }

  return `${data.join('\n')}
let PC;
const code = [
  ${instructions.join('\n  ')}
];
for (PC = 0; PC < code.length; PC++) code[PC]();`;
};

////////////////////

const input = `

.data
numPrimes: .word 1000

.align 2 # mips bs, try not to think about this
arr: .space 4000 # 1000 primes, 4 bytes each

.text
main:
  li $s0, 2 # num
  li $s1, 0 # len
loop:
  lw $t0, numPrimes # copy numPrimes into a temporary register
  bge $s1, $t0, done # jump to done when $s1 >= $t0
  
  jal isPrime # jump and link. Calls isPrime
  beq $v0, $zero, endIf # if isPrime returns 0, skip the following instructions

  sll $t0, $s1, 2 # shift left logical: index = len << 2 (4 bytes per number)
  sw $s0, arr($t0) # arr[index] = num
  addi $s1, $s1, 1 # len++
endIf:
  addi $s0, $s0, 1 # num++
  j loop # jump
isPrime:
  li $t0, 0 # i = 0
  li $v0, 1
isPrimeForLoop:
  bge $t0, $s1, returnIsPrime # if (i >= len) jump out of isPrimeForLoop
  
  sll $t1, $t0, 2 # index = i * 4
  div $s0, arr($t1) # [hi, lo] = [$s0 % arr[index], Math.floor($s0 / arr[index])]
  mfhi $t1
  add $v0, $t1, $zero # set return value to $t1, which is num % arr[i]

  beq $v0, $zero, returnIsPrime # if $v0 === 0, return 0
  addi $t0, $t0, 1
  j isPrimeForLoop
returnIsPrime:
  jr $ra # return to after where jal was used
done:
  output arr # I made this up
`;

const hello = `
.data
  str: .asciiz "Hello, World!" # z means null terminated

.text # this gets loaded into instruction memory
main: # a label
  li $v0, 4 # load immediate 4 into register v0, which prepares it print
  la $a0, str # load pArameter str into register a0
  syscall # makes the print happen with the loaded parameter
`;

const josh1 = `
.data
num: .word 5
.text
li $t0 4
lw $t1 num
bne $t0 $t1 next
addi $t0, $t0, 1
next:
addiu $t1, $t1, 5 #add unsigned immediate
addu $t0, $t0, $t1 #add unsigned`;

const josh2 = `
.data
.text
li $s0, 12
li $s1, 4
or $s0, $s0, $s1
ori $s0, $s0, 3
mult $s0, $s1 #{hi/lo} = a * b
mflo $t0`;

const res = mipsToJs(input);
console.log(res);
eval(res);
