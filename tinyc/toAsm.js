// takes an array of instructions for the arguments of printf and returns an array of instructions for doing the printing
const printf = (args) => [
  ...args.slice(0, -1), // push the reversed args onto the stack
  ...args[args.length - 1] // the template string
    .slice(5) // remove 'PUSH '
    .match(/%d|./g) // replace %d with N, and other characters with PUSH char N
    .flatMap((char) =>
      char === '%d' ? 'PRINTN' : [`PRINTC ${char.charCodeAt(0)}`]
    ),
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

  const [kind] = node;
  const args = node.slice(1).map((arg) => toAsm(arg));
  const [a, b, c, d] = args;
  if (operators[kind]) return [...a, ...b, operators[kind]];

  switch (kind) {
    case 'number':
    case 'string':
      return [`PUSH ${a}`];
    case 'block':
      return args.flat();
    case 'var':
      return [`FETCH ${a}`];
    case 'not':
      return [...a, 'NOT'];
    case 'assignment':
      return [...b, `STORE ${a[0].slice(6)}`]; // remove "FETCH "
    case 'ifStmt':
      return [...a, `JZ ${b.length}`, ...b];
    case 'ifElse':
      return [...a, `JZ ${b.length + 1}`, ...b, `JMP ${c.length}`, ...c];
    case 'whileLoop':
      return [
        ...a, // loop condition
        `JZ ${b.length + 1}`,
        ...b, // loop body
        `JMP ${-a.length - b.length - 2}`,
      ];
    case 'doWhile':
      return [...a, ...b, `JNZ ${-a.length - b.length - 1}`];
    case 'forLoop':
      return [
        ...a, // initializer
        ...b, // loop condition
        `JZ ${c.length + d.length + 3}`,
        ...d, // loop body
        ...c, // incrementer
        `JMP ${-b.length - c.length - d.length - 3}`,
      ];
    case 'expression':
      return [...a, 'POP'];
    case 'parenthetical':
      return args.reverse().flat();
    case 'argument':
      return a;
    case 'semicolon':
      return [];
    case 'functionCall': {
      if (a[0] === 'FETCH printf') return printf(b);
    }
  }
  throw new Error(`ASM ERROR: wtf is ${JSON.stringify(node)}`);
};
