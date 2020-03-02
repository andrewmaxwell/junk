const combs = ([...a], b) => {
  let len = a.length + b.length;
  for (let i = 2 - a.length; i < a.length + b.length - 1; i++) {
    if (a.every((c, i) => c === '.' || b[c + i] === '.')) {
      len = Math.min(
        len,
        i < 0 ? b.length - i : Math.max(i + a.length, b.length)
      );
    }
  }
  return len;
};

const {Test} = require('./test.js');
Test.assertEquals(combs('*..*', '*.*'), 5);
Test.assertEquals(combs('*...*', '*.*'), 5);
Test.assertEquals(combs('*..*.*', '*.***'), 9);
Test.assertEquals(combs('*.*', '*.*'), 4);
Test.assertEquals(combs('*.**', '*.*'), 5);
