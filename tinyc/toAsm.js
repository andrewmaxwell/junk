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
const toAsmRec = (node) => {
  if (!Array.isArray(node)) return node;

  const [kind] = node;
  const args = node.slice(1).map((arg) => toAsmRec(arg));
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
      return [...b, `STORE ${a[0].slice(6)}`]; // .slice(6) to remove "FETCH "
    case 'ifStmt':
      return [
        ...a, // if condition
        `JZ ${b.length}`,
        ...b, // if body
      ];
    case 'ifElse':
      return [
        ...a, // if condition
        `JZ ${b.length + 1}`,
        ...b, // if body
        `JMP ${c.length}`,
        ...c, // else body
      ];
    case 'whileLoop':
      return [
        ...a, // loop condition
        `JZ ${b.length + 1}`,
        ...b, // loop body
        `JMP ${-a.length - b.length - 2}`,
      ];
    case 'doWhile':
      return [
        ...a, // body
        ...b, // loop condition
        `JNZ ${-a.length - b.length - 1}`,
      ];
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
      const funcName = a[0].slice(6); // remove 'FETCH ';
      if (funcName === 'printf') return printf(b);
      return [...b, `CALL ${funcName}`];
    }
    case 'functionDeclaration': {
      const args = b.flatMap((x) => [`STORE ${x.slice(6)}`, 'POP']);
      return [`JMP ${args.length + c.length}//function:${a}`, ...args, ...c];
    }
    case 'return': {
      return [...a.slice(0, -1), 'RETURN'];
    }
  }
  throw new Error(`ASM ERROR: wtf is ${JSON.stringify(node)}`);
};

const resolveFunctionJumps = (asm) => {
  const funcs = {};

  return asm
    .map((line, i) =>
      line.replace(/\/\/function:(.+)/, (_, b) => {
        funcs[b] = i;
        return '';
      })
    )
    .map((line, i) =>
      line.replace(/^CALL (.+)/, (_, b) => `CALL ${funcs[b] - i}`)
    );
};

export const toAsm = (tokens) => resolveFunctionJumps(toAsmRec(tokens));
