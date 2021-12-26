const compile = (str) => str;

const {Test} = require('../misc/test');

const tests = [
  ['(+ 1 2)', [1, 3, 'add']],
  ['(+ (8 / 4) 7', '8 4 div 7 add'],
  ['(eq 3 4)', '3 4 eq'],
  ["(car '(a b c))", 'c b cons a cons car'],
];
