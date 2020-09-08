const pass = () => console.log('\x1b[32m%s\x1b[0m', 'PASS');
const fail = (msg) => console.log('\x1b[31m%s\x1b[0m', msg);

exports.it = (desc, func) => {
  console.log('\n' + desc);
  func();
};

const {equals, toString} = require('ramda');
exports.Test = {
  describe: exports.it,
  assertEquals: (actual, expected, description) => {
    if (description) console.log(description);
    if (equals(actual, expected)) pass();
    // else fail(`Expected ${toString(expected)}, got ${toString(actual)}`);
    else fail(`Expected\n${expected}\nGot\n${actual}\n`);
  },
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
};
exports.Test.assertSimilar = exports.Test.assertDeepEquals =
  exports.Test.assertEquals;
