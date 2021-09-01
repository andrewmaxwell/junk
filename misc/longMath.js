const normalize = (arr) => {
  let carry = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i] + carry;
    carry = Math.floor(x / 10);
    arr[i] = (x + 10) % 10;
  }
  if (carry) arr.push(carry);
  return arr;
};

const _add = (a, b) =>
  normalize(
    (a.length > b.length ? a : b).map((_, i) => (a[i] || 0) + (b[i] || 0))
  );

const _subtract = (a, b) => normalize(a.map((v, i) => v - (b[i] || 0)));

const _multiply = (a, b) => {
  const result = [];
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      result[i + j] = (result[i + j] || 0) + a[i] * b[j];
  return normalize(result);
};

const lt = (a, b) => {
  if (b.length !== a.length) return a.length < b.length;
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
};

const _divide = (a, b) => {
  let low = [0];
  let high = a;
  for (let i = 0; i < 1e3; i++) {
    const mid = _multiply(_add(low, high), [5]).slice(1);
    if (!lt(low, mid) || !lt(mid, high)) break;
    if (lt(a, _multiply(mid, b))) high = mid;
    else low = mid;
  }
  return lt(a, _multiply(high, b)) ? low : high;
};

const big = (func) => (a, b) =>
  func(...[a, b].map((a) => a.split('').reverse().map(Number)))
    .reverse()
    .join('')
    .replace(/^0+/, '') || '0';

const add = big(_add);
const subtract = big(_subtract);
const multiply = big(_multiply);
const divide = big(_divide);

/////////////////////////////////////////////////////////
const {Test} = require('./test');
Test.assertEquals(add('0', '1'), '1');
Test.assertEquals(add('1', '0'), '1');
Test.assertEquals(add('1', '1'), '2');
Test.assertEquals(add('123', '321'), '444');

Test.assertEquals(subtract('10', '9'), '1');
Test.assertEquals(subtract('45', '45'), '0');

Test.assertEquals(multiply('0', '0'), '0');
Test.assertEquals(multiply('1', '0'), '0');
Test.assertEquals(multiply('0', '1'), '0');
Test.assertEquals(multiply('1', '1'), '1');
Test.assertEquals(multiply('123', '123'), '15129');

// Test.assertEquals(divide('4277', '47'), '91');
// Test.assertEquals(divide('1', '1'), '1');
// Test.assertEquals(divide('2', '1'), '2');
// Test.assertEquals(divide('3', '2'), '1');
Test.assertEquals(divide('4', '5'), '0');
Test.assertEquals(divide('100', '11'), '9');

Test.assertEquals(
  add('12345678901234567890', '12345678901234567890'),
  '24691357802469135780'
);

Test.assertEquals(
  subtract('24691357802469135780', '12345678901234567890'),
  '12345678901234567890'
);

Test.assertEquals(
  multiply('12345678901234567890', '12345678901234567890'),
  '152415787532388367501905199875019052100'
);

Test.assertEquals(divide('24691357802469135780', '12345678901234567890'), '2');

// The four following functions all do the same thing. Put them in order from highest quality code to lowest quality code.

```
// A: Ramda
const doStuff_A = pipe(
  chain(values),
  uniqBy(prop('instanceSeq')),
  pluck('instructionValues'),
  chain(values)
);

// B: Chaining
const doStuff_B = (data) =>
  data.flatMap(Object.values).reduce(
    (acc, el) => {
      if (!acc.seen.has(el.instanceSeq)) {
        acc.seen.add(el.instanceSeq);
        acc.result.push(...Object.values(el.instructionValues));
      }
      return acc;
    },
    {seen: new Set(), result: []}
  ).result;

// C: More idiomatic chaining via adding to prototype
const doStuff_C = (data) =>
  data
    .flatMap(Object.values)
    ._uniqBy((el) => el.instanceSeq)
    .flatMap((el) => Object.values(el.instructionValues));

Array.prototype._uniqBy = function (keyFunc) {
  const seen = new Set();
  return this.filter((el) => {
    const key = keyFunc(el);
    if (!seen.has(key)) {
      seen.add(key);
      return true;
    }
  });
};

// D: Many for loop, wow
const doStuff_D = (data) => {
  const seen = {};
  const result = [];
  for (let i = 0; i < data.length; i++) {
    for (const key in data[i]) {
      const obj = data[i][key];
      if (!seen[obj.instanceSeq]) {
        seen[obj.instanceSeq] = true;
        for (const key2 in obj.instructionValues) {
          result.push(obj.instructionValues[key2]);
        }
      }
    }
  }
  return result;
};
```;
