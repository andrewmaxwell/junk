const ops = {
  '-': {prec: 0, func: (a, b) => a - b},
  '+': {prec: 0, func: (a, b) => a + b},
  '*': {prec: 1, func: (a, b) => a * b},
  '/': {prec: 1, func: (a, b) => a / b},
};

const calc = (arr) => {
  const idx = arr
    .map((el) => (ops[el] || {}).prec)
    .reduce((r, p, i) => (p <= r[0] ? [p, i] : r), [2, -1])[1];
  return idx === -1
    ? arr[0]
    : ops[arr[idx]].func(calc(arr.slice(0, idx)), calc(arr.slice(idx + 1)));
};

const Calculator = function () {
  this.evaluate = (str) =>
    calc(str.match(/-?\d+|\+|-|\*|\//g).map((n) => (isNaN(n) ? n : Number(n))));
};

const {Test} = require('./test');
var calculate = new Calculator();
Test.assertEquals(calculate.evaluate('127'), 127);
Test.assertEquals(calculate.evaluate('2 + 3'), 5);
Test.assertEquals(calculate.evaluate('2 - 3 - 4'), -5);
Test.assertEquals(calculate.evaluate('10 * 5 / 2'), 25);
