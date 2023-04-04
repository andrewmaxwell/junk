// takes a syntax tree (or node) and converts it to an array of assembly tokens (strings)
export const toAsm = (node) => {
  if (!Array.isArray(node)) return node;

  const [kind, ...args] = node;
  if (kind === 'block') return args.flatMap(toAsm);

  const [a, b, c] = args.map(toAsm);
  if (kind === 'variable') return ['FETCH', ...a];
  if (kind === 'number') return ['PUSH', a];
  if (kind === 'assignment') return [...b, 'STORE', a[1]];
  if (kind === 'add') return [...a, ...b, 'ADD'];
  if (kind === 'subtract') return [...a, ...b, 'SUB'];
  if (kind === 'lessThan') return [...a, ...b, 'LT'];
  if (kind === 'ifStmt') return [...a, 'JZ', b.length + 1, ...b];
  if (kind === 'ifElse')
    return [...a, 'JZ', b.length + 3, ...b, 'JMP', c.length + 1, ...c];
  if (kind === 'whileLoop')
    return [...a, 'JZ', b.length + 2, ...b, 'JMP', -a.length - b.length - 3];
  if (kind === 'doWhile') return [...a, ...b, 'JNZ', -a.length - b.length - 1];
  if (kind === 'expression') return [...a, 'POP'];
  if (kind === 'parenthetical') return a;
  if (kind === 'semicolon') return [];
  throw new Error(`wtf is ${JSON.stringify(node)}`);
};
