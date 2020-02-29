exports.it = (desc, func) => {
  console.log(desc);
  func();
};

exports.Test = {
  assertEquals: (actual, expected) => {
    if (actual === expected) console.log('PASS');
    else console.error(`Expected ${expected}, got ${actual}`);
  }
};
