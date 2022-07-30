const ops = [
  {op: '+', func: (a, b) => a + b},
  {op: '-', func: (a, b) => a - b},
  {op: '*', func: (a, b) => a * b},
  {op: '$', func: (a, b) => a / b},
];

function calculate(str) {
  for (const {op, func} of ops) {
    const index = str.lastIndexOf(op);
    if (index < 1) continue;

    const result = func(
      calculate(str.slice(0, index)),
      calculate(str.slice(index + 1))
    );

    return isNaN(result) ? '400: Bad request' : result;
  }
  return isNaN(str) ? '400: Bad request' : parseFloat(str);
}

import {Test} from './test.js';

Test.failFast = true;
Test.assertEquals(calculate('1'), 1);
Test.assertEquals(calculate('1.1'), 1.1);
Test.assertEquals(calculate('1+1'), 2);
Test.assertEquals(calculate('1-1'), 0);
Test.assertEquals(calculate('2$2'), 1);
Test.assertEquals(calculate('2*2'), 4);

Test.assertEquals(calculate('1.1+1.9'), 3);
Test.assertEquals(calculate('9$4'), 2.25);
Test.assertEquals(calculate('1.5*3'), 4.5);
Test.assertEquals(calculate('5-43.2'), -38.2);

Test.assertEquals(calculate('5+5+5+5'), 20);
Test.assertEquals(calculate('5-5-5-5'), -10);
Test.assertEquals(calculate('5*5*5*5'), 625);
Test.assertEquals(calculate('5$5$5$5'), 0.04);

Test.assertEquals(calculate('1+1-1'), 1);
Test.assertEquals(calculate('5*6$2+5-10'), 10);
Test.assertEquals(calculate('1*1*1*1*1*1$1$1$1$1+1-1+9-1'), 9);
Test.assertEquals(calculate('1000$2.5$5+5-5+6$6'), 81);

Test.assertEquals(calculate('5*6$2&5-10'), '400: Bad request');
Test.assertEquals(calculate('5/10'), '400: Bad request');
Test.assertEquals(calculate('p'), '400: Bad request');
Test.assertEquals(calculate('9^9'), '400: Bad request');
