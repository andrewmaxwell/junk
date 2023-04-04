// takes an expected type (string) and token and throws an error if the types don't match
const expectToken = (expectedType, token) => {
  if (token?.type !== expectedType)
    throw new Error(`Expected "${expectedType}", got ${JSON.stringify(token)}`);
};

// different node types have different numbers of static tokens that need to be accounted for when calculating their length
const typeLengths = {
  add: 1, // +
  subtract: 1, // -
  lessThan: 1, // <
  assignment: 1, // =
  ifStmt: 1, // if
  ifElse: 2, // if, else
  whileLoop: 1, // while
  doWhile: 2, // do, while
  semicolon: 1, // ;
  expression: 1, // ;
  parenthetical: 2, // (, )
  block: 2, // {, }
};

// takes a node and returns the number of tokens that make it up
// example: ['add', ['variable', 'i'], ['number', 5]] represents i+5, which is 3 tokens
const len = ([type, ...args]) =>
  args
    .map((a) => (Array.isArray(a) ? len(a) : 1))
    .reduce((a, b) => a + b, typeLengths[type] || 0);

// tokens an array of tokens and returns the first term. A term can be a variable, a number, or a parenthesized expression
const parseTerm = (tokens) =>
  tokens[0]?.type === 'variable' || tokens[0]?.type === 'number'
    ? [tokens[0].type, tokens[0].value]
    : parseParenExpr(tokens);

// takes an array of tokens and returns an array of partially formed terms as long as they're joined by + or -
const splitSum = (tokens) => {
  const type = tokens[0]?.type;
  if (type !== '+' && type !== '-') return [];
  const nextTerm = parseTerm(tokens.slice(1));
  return [
    ...splitSum(tokens.slice(1 + len(nextTerm))),
    [type === '+' ? 'add' : 'subtract', nextTerm],
  ];
};

// takes an array of tokens and returns a node that totals up the terms
const parseSum = (tokens) => {
  const firstTerm = parseTerm(tokens);
  return splitSum(tokens.slice(len(firstTerm))).reduce(
    (a, [type, b]) => [type, a, b],
    firstTerm
  );
};

// takes an array of tokens and returns either the first comparison or the sum it starts with
const parseComparison = (tokens) => {
  const sum = parseSum(tokens);
  const l = len(sum);
  return tokens[l]?.type === '<'
    ? ['lessThan', sum, parseSum(tokens.slice(l + 1))]
    : sum;
};

// takes an array of tokens and returns either the first comparison or an assignment
const parseExpr = (tokens) => {
  const comparisonAst = parseComparison(tokens);
  return tokens[0]?.type === 'variable' &&
    comparisonAst[0] === 'variable' &&
    tokens[len(comparisonAst)]?.type === '='
    ? [
        'assignment',
        comparisonAst,
        parseExpr(tokens.slice(len(comparisonAst) + 1)),
      ]
    : comparisonAst;
};

// takes an array of tokens and returns the parenthesized expression at the beginning
const parseParenExpr = (tokens) => {
  expectToken('(', tokens[0]);
  const expr = parseExpr(tokens.slice(1));
  expectToken(')', tokens[len(expr) + 1]);
  return ['parenthetical', expr];
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
  expectToken('while', tokens[len(loopBody) + 1]);
  const doAst = [
    'doWhile',
    loopBody,
    parseParenExpr(tokens.slice(len(loopBody) + 2)),
  ];
  expectToken(';', tokens[len(doAst)]);
  return doAst;
};

// takes an array of tokens and returns the expression at the beginning
const parseExprStmt = (tokens) => {
  const expr = parseExpr(tokens);
  expectToken(';', tokens[len(expr)]);
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
  const ast = parseStatement(tokens);
  if (tokens.length !== len(ast)) {
    throw new Error(
      `Expected end of input, got ${JSON.stringify(tokens[len(ast)])}`
    );
  }
  return ast;
};
