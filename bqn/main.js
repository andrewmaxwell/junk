const ops = {
  '+': 'add',
  '-': 'subtract',
  '¯': 'subtract', // not exactly?
  '×': 'multiply',
  '÷': 'divide',
  '⋆': 'power',
  '√': 'root',
};

const modifiers = {
  '˜': 'swap',
  '⁼': 'undo',
  '˙': 'constant',
};

const twoModifiers = {
  '∘': 'compose',
};

const vals = {
  π: 'Math.PI',
  '∞': Infinity,
  '@': "'\x00'",
};

const getOpIndex = (input) => {
  let parenDepth = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '(') parenDepth++;
    else if (input[i] === ')') {
      parenDepth--;
      if (parenDepth < 0) {
        throw new Error(`Too many closing parentheses: "${input}"`);
      }
    } else if (!parenDepth && ops[input[i]]) return i;
  }
  if (parenDepth) {
    throw new Error(`Too many opening parentheses: "${input}"`);
  }
  return -1;
};

const getOpLength = (input) => {
  for (let i = 1; i < input.length; i++) {
    const c = input[i];
    if (
      modifiers[c] ||
      twoModifiers[c] ||
      (input.includes('∘') && (ops[c] || '()'.includes(c)))
    )
      continue;

    return i;
  }
  return input.length;
};

const getFuncName = (input) => {
  if (input.length === 1) return ops[input];
  if (input.includes('∘')) {
    return `compose(${input.split('∘').map(getFuncName).join(', ')})`;
  }
  if (input[0] === '(' && input[input.length - 1] === ')') {
    return getFuncName(input.slice(1, -1));
  }

  const modName = modifiers[input[input.length - 1]];
  const arg = getFuncName(input.slice(0, -1));
  return `${modName}(${arg})`;
};

export const bqnToJs = (input) => {
  input = input.trim();
  if (vals[input]) return vals[input];

  const opIndex = getOpIndex(input);
  if (opIndex === -1) {
    return input[0] === '(' && input[input.length - 1] === ')'
      ? bqnToJs(input.slice(1, -1))
      : input || null;
  }

  const opLength = getOpLength(input.slice(opIndex));

  const funcName = getFuncName(input.slice(opIndex, opIndex + opLength));
  const left = bqnToJs(input.slice(0, opIndex));
  const right = bqnToJs(input.slice(opIndex + opLength));
  return `${funcName}(${left}, ${right})`;
};
