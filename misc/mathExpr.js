const ops = {
  '+': {precedence: 1, func: (a, b) => a + b},
  '-': {precedence: 2, func: (a, b) => (a || 0) - b},
  '*': {precedence: 3, func: (a, b) => a * b},
  '/': {precedence: 4, func: (a, b) => a / b}
};

const calc = expr => {
  expr = expr.replace(/\s/g, '');
  if (!isNaN(expr)) return Number(expr);
  let parenDepth = 0;
  let indexOfOp = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') parenDepth++;
    else if (c === ')') parenDepth--;
    else if (
      !parenDepth && // not in parentheses
      ops[c] && // is operator
      !(i && ops[expr[i - 1]]) && // previous is not operator
      (!indexOfOp || ops[c].precedence < ops[expr[indexOfOp]].precedence) // operator is lower precedence than current lowest
    )
      indexOfOp = i;
  }
  const op = expr[indexOfOp];
  return op === '('
    ? calc(expr.slice(1, -1))
    : ops[op].func(
        calc(expr.slice(0, indexOfOp)),
        calc(expr.slice(indexOfOp + 1))
      );
};

`6 + -(4)   // 2
6 + -( -4) // 10`
  .split('\n')
  .map(line => {
    const [expr, expected] = line.split(/\s*\/\/\s*/);
    return [expr, Number(expected)];
  })
  .concat([
    ['1+1', 2],
    ['1 - 1', 0],
    ['1* 1', 1],
    ['1 /1', 1],
    ['-123', -123],
    ['123', 123],
    ['2 /2+3 * 4.75- -6', 21.25],
    ['12* 123', 1476],
    ['2 / (2 + 3) * 4.33 - -6', 7.732],
    ['12*-1', -12],
    ['12* 123/-(-5 + 2)', 492],
    ['(1 - 2) + -(-(-(-4)))', 3]
  ])
  .forEach(([expr, expected]) => {
    const actual = calc(expr);
    if (actual !== expected) {
      console.error(
        `\nFAILED TEST\n${expr} should be ${expected}, got ${JSON.stringify(
          actual
        )}\n`
      );
    }
    // console.log(expr, calc(expr));
  });

// const expr = '2 / (2 + 3) * 4.33 - -6';
// console.log(calc(expr));
