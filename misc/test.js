exports.it = (desc, func) => {
  console.log('\n' + desc);
  func();
};

const {equals, toString} = require('ramda');
exports.Test = {
  describe: exports.it,
  assertEquals: (actual, expected, description) => {
    if (description) console.log(description);
    if (equals(actual, expected)) console.log('\x1b[32m%s\x1b[0m', 'PASS');
    else
      console.log(
        '\x1b[31m%s\x1b[0m',
        `Expected ${toString(expected)}, got ${toString(actual)}`
        // `Expected\n${expected}\nGot\n${actual}\n`
      );
  },
};
exports.Test.assertSimilar = exports.Test.assertDeepEquals =
  exports.Test.assertEquals;
