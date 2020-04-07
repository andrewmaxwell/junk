exports.it = (desc, func) => {
  console.log(desc);
  func();
};

const {equals, toString} = require('ramda');
exports.Test = {
  describe: exports.it,
  assertEquals: (actual, expected) => {
    if (equals(actual, expected)) console.log('\x1b[32m%s\x1b[0m', 'PASS');
    else
      console.log(
        '\x1b[31m%s\x1b[0m',
        `Expected ${toString(expected)}, got ${toString(actual)}`
      );
  }
};
exports.Test.assertSimilar = exports.Test.assertDeepEquals =
  exports.Test.assertEquals;
