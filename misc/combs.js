const combs = ([...a], b) => {
  let best = Infinity;
  for (let i = -a.length; i < b.length - 1; i++) {
    if (a.every((s, j) => s !== '*' || b[j + i] !== '*')) {
      best = Math.min(best, Math.max(i + a.length, b.length) - Math.min(i, 0));
    }
  }
  return best;
};

const {Test} = require('./test.js');
Test.assertEquals(combs('*..*', '*.*'), 5);
Test.assertEquals(combs('*...*', '*.*'), 5);
Test.assertEquals(combs('*..*.*', '*.***'), 9);
Test.assertEquals(combs('*.*', '*.*'), 4);
Test.assertEquals(combs('*.**', '*.*'), 5);
