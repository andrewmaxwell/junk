import {tokenize} from '../ramda-compiler/tokenize.js';
const {reject, propEq, tap, pipe} = window.R;

const match = (defs, type, tokens, stack = []) =>
  defs[type]
    ? {type, ...defs[type](defs, tokens, stack.concat(type))}
    : tokens.length && type === tokens[0].type
    ? tokens[0]
    : {error: `Expected ${type}`, stack};

const seq = (arr, min = 1, max = 1) => (defs, tokens, stack) => {
  const children = [];
  let tokenIndex = 0;
  for (let j = 0; j < max && j < tokens.length; j++) {
    for (let i = 0; i < tokens.length && i < arr.length; i++) {
      const child = match(defs, arr[i], tokens.slice(tokenIndex), stack);
      if (child.error) {
        if (j >= min) break;
        else return child;
      }
      children.push(child);
      tokenIndex += child.length || 1;
    }
  }
  return {children, length: tokenIndex};
};

const or = arr => (defs, tokens, stack) => {
  const errors = [];
  for (let i = 0; tokens.length && i < arr.length; i++) {
    if (stack.includes(arr[i])) continue;
    const m = match(defs, arr[i], tokens, stack);
    if (m.error) errors.push(m.error);
    else return m;
  }
  return {error: errors};
};

const defs = {
  infixOp: or(['+', '-', '*', '/', '<', '<=', '>', '>=']),
  // assignmentOp: or(['=', '+=', '-=', '*=', '/=', '&=', '|=']),
  declarationType: or(['var', 'let', 'const']),
  expr: or([
    'functionDef',
    'infixGroup',
    'assignment',
    'array',
    'functionCall',

    'id',
    'number',
    'string',
    'boolean'
  ]),
  statement: or(['declaration', 'expr']), // if, for, while, try

  // functionCall: seq(['expr', '(', 'commaExprList', ')']),

  infixOpList: seq(['infixOp', 'expr'], 1, Infinity),
  infixGroup: seq(['expr', 'infixOpList']),

  array: seq(['[', ']']),

  anyNumCommaId: seq([',', 'id'], 0, Infinity),
  commaIdList: seq(['id', 'anyNumCommaId'], 0, 1),
  argList: seq(['(', 'commaIdList', ')']),
  args: or(['id', 'argList']),

  functionDef: seq(['args', '=>', 'expr']),
  assignment: seq(['id', 'assignmentOp', 'expr']),
  declaration: seq(['declarationType', 'id', '=', 'expr']),

  program: seq(['statement', ';'], 1, Infinity)
};

const textarea = document.querySelector('textarea');
textarea.oninput = window.parse = () => {
  document.querySelector('pre').innerHTML = pipe(
    tap(v => (localStorage.parseInput = v)),
    tokenize,
    reject(propEq('type', 'space')),
    tap(d => console.log('tokens', d)),
    t => match(defs, 'program', t),
    d => JSON.stringify(d, null, 2)
  )(textarea.value);
};
textarea.value = localStorage.parseInput;
window.parse();
