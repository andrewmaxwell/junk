const {equals, toString} = require('ramda');

const pass = () => console.log('\x1b[32m%s\x1b[0m', 'PASS');
const fail = (msg) => console.log('\x1b[31m%s\x1b[0m', msg);

const assertEquals = (actual, expected, description) => {
  if (description) console.log(description);
  if (equals(actual, expected)) pass();
  else fail(`Expected \n${toString(expected)}\nGot \n${toString(actual)}\n\n`);
  // else fail(`Expected\n${expected}\nGot\n${actual}\n`);
};

exports.it = (desc, func) => {
  console.log('\n' + desc);
  func();
};

exports.Test = {
  describe: exports.it,
  it: exports.it,
  assertEquals,
  assertSimilar: assertEquals,
  assertDeepEquals: assertEquals,
  expectError: (func) => {
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
};
