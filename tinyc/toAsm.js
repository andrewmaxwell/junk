// takes an array of instructions for the arguments of printf and returns an array of instructions for doing the printing
const printf = (args) => [
  ...args.slice(0, -2), // push the reversed args onto the stack
  ...args[args.length - 1] // the template string
    .match(/%d|./g) // replace %d with PRINT, and other characters with PUSH char PRINT
    .flatMap((char) => (char === '%d' ? 'PRINT' : ['PUSH', char, 'PRINT'])),
];

const operators = {
  '+': 'ADD',
  '-': 'SUB',
  '*': 'MULT',
  '/': 'DIV',
  '%': 'MOD',
  '&&': 'AND',
  '||': 'OR',
  '<': 'LT',
  '<=': 'LTE',
  '>': 'GT',
  '>=': 'GTE',
  '==': 'EQ',
  '!=': 'NEQ',
};

// takes a syntax tree (or node) and converts it to an array of assembly tokens (strings)
export const toAsm = (node) => {
  if (!Array.isArray(node)) return node;

  const [kind, ...rawArgs] = node;
  const args = rawArgs.map(toAsm);

  if (kind === 'block') return args.flat();

  const [a, b, c] = args;
  if (operators[kind]) return [...a, ...b, operators[kind]];
  if (kind === 'variable') return ['FETCH', a];
  if (kind === 'not') return [...a, 'NOT'];
  if (kind === 'number' || kind === 'string') return ['PUSH', a];
  if (kind === 'assignment') return [...b, 'STORE', a[1]];
  if (kind === 'ifStmt') return [...a, 'JZ', b.length + 1, ...b];
  if (kind === 'ifElse')
    return [...a, 'JZ', b.length + 3, ...b, 'JMP', c.length + 1, ...c];
  if (kind === 'whileLoop')
    return [...a, 'JZ', b.length + 3, ...b, 'JMP', -a.length - b.length - 3];
  if (kind === 'doWhile') return [...a, ...b, 'JNZ', -a.length - b.length - 1];
  if (kind === 'expression') return [...a, 'POP'];
  if (kind === 'parenthetical') return args.reverse().flat();
  if (kind === 'argument') return a;
  if (kind === 'semicolon') return [];
  if (kind === 'functionCall') {
    if (a[1] === 'printf') return printf(b);
  }
  throw new Error(`ASM ERROR: wtf is ${JSON.stringify(node)}`);
};
