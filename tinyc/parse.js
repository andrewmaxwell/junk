// takes an expected type (string) and token and throws an error if the types don't match
const expectToken = (expectedType, tokens) => {
  if (tokens[0]?.type !== expectedType)
    throw new Error(
      `Expected "${expectedType}", got ${tokens
        .map((t) => (t.value === undefined ? t.type : t.value))
        .join(' ')}`
    );
};

// different node types have different numbers of static tokens that need to be accounted for when calculating their length
const typeLengths = Object.fromEntries(
  [
    'number string functionCall var', // 0
    '+ - && || * / % < <= > >= == != not assignment ifStmt whileLoop semicolon expression argument', // 1
    'ifElse doWhile parenthetical block', // 2
    '',
    '',
    'forLoop', // 5
  ].flatMap((list, i) => (list ? list.split(' ').map((t) => [t, i]) : []))
);

// takes a node and returns the number of tokens that make it up
// example: ['+', ['var', 'i'], ['number', 5]] represents i+5, which is 3 tokens
const len = ([type, ...args]) => {
  if (typeLengths[type] === undefined) {
    throw new Error(`typeLength for ${type} is not defined!`);
  }
  return args
    .map((a) => (Array.isArray(a) ? len(a) : 1))
    .reduce((a, b) => a + b, typeLengths[type]);
};

const parseFunctionCall = (tokens) =>
  tokens[1]?.type === '('
    ? [
        'functionCall',
        ['var', tokens[0].value],
        parseParenExpr(tokens.slice(1)),
      ]
    : ['var', tokens[0].value];

// tokens an array of tokens and returns the first term. A term can be a var, a number, a string, a function call, or a parenthesized expression
const parseTerm = (tokens) => {
  const t = tokens[0]?.type;
  if (t === 'number' || t === 'string') return [t, tokens[0].value];
  if (t === 'var') return parseFunctionCall(tokens);
  return parseParenExpr(tokens);
};

const parseNot = (tokens) =>
  tokens[0]?.type === '!'
    ? ['not', parseTerm(tokens.slice(1))]
    : parseTerm(tokens);

const parseChain = (nextFunc, types) => {
  const splitChain = (tokens) => {
    const type = tokens[0]?.type;
    if (!types.includes(type)) return [];
    const nextTerm = nextFunc(tokens.slice(1));
    return [...splitChain(tokens.slice(1 + len(nextTerm))), [type, nextTerm]];
  };

  return (tokens) => {
    const first = nextFunc(tokens);
    return splitChain(tokens.slice(len(first))).reduce(
      (a, [type, b]) => [type, a, b],
      first
    );
  };
};

const parseOps = [
  ['*', '/', '%'],
  ['+', '-'],
  ['<<', '>>'],
  ['<', '<=', '>', '>='],
  ['==', '!='],
  // ['&'],
  // ['^'],
  // ['|'],
  ['&&'],
  ['||'],
].reduce(parseChain, parseNot);

// takes an array of tokens and returns either the first comparison or an assignment
const parseExpr = (tokens) =>
  tokens[0]?.type === 'var' && tokens[1]?.type === '='
    ? ['assignment', ['var', tokens[0].value], parseExpr(tokens.slice(2))]
    : parseOps(tokens);

// takes an array of tokens and returns an array of argument nodes
const parseArgs = (tokens) => {
  if (tokens[0]?.type !== ',') return [];
  const expr = parseExpr(tokens.slice(1));
  return [['argument', expr], ...parseArgs(tokens.slice(1 + len(expr)))];
};

// takes an array of tokens and returns the parenthesized expression at the beginning
const parseParenExpr = (tokens) => {
  expectToken('(', tokens);
  const firstExpr = parseExpr(tokens.slice(1));
  const ast = [
    'parenthetical',
    firstExpr,
    ...parseArgs(tokens.slice(1 + len(firstExpr))),
  ];
  expectToken(')', tokens.slice(len(ast) - 1));
  return ast;
};

// takes an array of tokens and returns a list of statements until it finds '}'
const getStatements = (tokens) => {
  if (tokens[0]?.type === '}') return [];
  const statement = parseStatement(tokens);
  return [statement, ...getStatements(tokens.slice(len(statement)))];
};

// takes an array of tokens starting with {type: 'if'} and returns an if or if/else node
const parseIf = (tokens) => {
  const condition = parseParenExpr(tokens.slice(1));
  const body = parseStatement(tokens.slice(1 + len(condition)));
  const ifAst = ['ifStmt', condition, body];
  return tokens[len(ifAst)]?.type === 'else'
    ? ['ifElse', condition, body, parseStatement(tokens.slice(len(ifAst) + 1))]
    : ifAst;
};

// takes an array of tokens starting with {type: 'while'} and returns a while loop
const parseWhile = (tokens) => {
  const condition = parseParenExpr(tokens.slice(1));
  return [
    'whileLoop',
    condition,
    parseStatement(tokens.slice(1 + len(condition))),
  ];
};

// takes an array of tokens starting with {type: 'do'} and returns a do loop
const parseDoWhile = (tokens) => {
  const loopBody = parseStatement(tokens.slice(1));
  expectToken('while', tokens.slice(len(loopBody) + 1));
  const doAst = [
    'doWhile',
    loopBody,
    parseParenExpr(tokens.slice(len(loopBody) + 2)),
  ];
  expectToken(';', tokens.slice(len(doAst)));
  return doAst;
};

const parseForLoop = (tokens) => {
  expectToken('(', tokens.slice(1));

  const initializer = parseExpr(tokens.slice(2));
  const initializerLen = len(initializer);
  expectToken(';', tokens.slice(initializerLen + 2));

  const condition = parseExpr(tokens.slice(initializerLen + 3));
  const conditionLen = len(condition);
  expectToken(';', tokens.slice(initializerLen + conditionLen + 3));

  const updater = parseExpr(tokens.slice(initializerLen + conditionLen + 4));
  const updaterLen = len(updater);
  expectToken(
    ')',
    tokens.slice(initializerLen + conditionLen + updaterLen + 4)
  );

  const body = parseStatement(
    tokens.slice(initializerLen + conditionLen + updaterLen + 5)
  );
  return ['forLoop', initializer, condition, updater, body];
};

// takes an array of tokens and returns the expression at the beginning
const parseExprStmt = (tokens) => {
  const expr = parseExpr(tokens);
  expectToken(';', tokens.slice(len(expr)));
  return ['expression', expr];
};

// takes an array of tokens and returns the statement at the beginning
const parseStatement = (tokens) => {
  switch (tokens[0]?.type) {
    case 'if':
      return parseIf(tokens);
    case 'while':
      return parseWhile(tokens);
    case 'do':
      return parseDoWhile(tokens);
    case 'for':
      return parseForLoop(tokens);
    case '{':
      return ['block', ...getStatements(tokens.slice(1))];
    case ';':
      return ['semicolon'];
    default:
      return parseExprStmt(tokens);
  }
};

// takes an array of tokens and returns a syntax tree
export const parse = (tokens) => {
  // console.log(tokens);
  tokens = [{type: '{'}, ...tokens, {type: '}'}];
  const ast = parseStatement(tokens);
  if (tokens.length !== len(ast)) {
    throw new Error(
      `Expected end of input, got ${JSON.stringify(tokens[len(ast)])}`
    );
  }
  return ast;
};
