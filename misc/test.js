import {equals, toString} from 'ramda';

const pass = () => console.log('\x1b[32m%s\x1b[0m', 'PASS');
const fail = (msg) => console.log('\x1b[31m%s\x1b[0m', msg);

const sort = (arr) =>
  arr.sort((a, b) => toString(a).localeCompare(toString(b)));

const assertEquals = (actual, expected, description) => {
  if (description) console.log(description);
  if (equals(actual, expected)) pass();
  else {
    fail(`Expected \n${toString(expected)}\nGot \n${toString(actual)}\n\n`);
    // fail(`Expected\n${expected}\nGot\n${actual}\n`);

    // fail('Got');
    // console.dir(actual, {depth: null});
    // fail('FAIL');

    if (Test.failFast) process.exit(1);
  }
};

export const it = (desc, func) => {
  console.log('\n' + desc);
  func();
};

export const describe = it;

export const Test = {
  assertEquals,
  assertSimilar: assertEquals,
  assertDeepEquals: assertEquals,
  expectError: (desc, func) => {
    console.log(desc);
    try {
      func();
      fail('Expected an error.');
    } catch {
      pass();
    }
  },
  expectNoError: (func) => {
    func();
    pass();
  },
  expect: (bool, msg) => {
    if (bool) pass();
    else fail(msg);
  },
  inspect: toString,
  assertSameMembers: (a, b) => assertEquals(sort(a), sort(b)),
};

export const deepLog = (x) => console.dir(x, {depth: Infinity});

export const logger =
  (label, func) =>
  (...args) => {
    const result = func(...args);
    console.log(`${label} args:`);
    for (const a of args) deepLog(a);
    console.log(`${label} result:`);
    deepLog(result);
    console.log('----------------------');
    return result;
  };
