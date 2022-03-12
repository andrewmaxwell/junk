import {equals, toString} from 'ramda';

const pass = () => console.log('\x1b[32m%s\x1b[0m', 'PASS');
const fail = (msg) => console.log('\x1b[31m%s\x1b[0m', msg);

const assertEquals = (actual, expected, description) => {
  if (description) console.log(description);
  if (equals(actual, expected)) pass();
  else fail(`Expected \n${toString(expected)}\nGot \n${toString(actual)}\n\n`);
  // else fail(`Expected\n${expected}\nGot\n${actual}\n`);
  // else throw new Error(`Expected\n${expected}\nGot\n${actual}\n`);

  // if (equals(actual, expected)) return;
  // if (description) console.log(description);
  // fail(`Expected \n${toString(expected)}\nGot \n${toString(actual)}\n\n`);
};

export const it = (desc, func) => {
  console.log('\n' + desc);
  func();
};

export const Test = {
  describe: it,
  it,
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
};

export const deepLog = (x) => console.dir(x, {depth: Infinity});
