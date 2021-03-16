const xxx = (n) => {
  const result = [];
  for (let i = n; i > 1; i--) {
    if (i * i >= n) continue;
    for (const x of xxx(n - i * i)) {
      result.push([...x, i]);
    }
  }
  return result;
};

const decompose = (n) => xxx(n * n);

const {Test} = require('./test');
Test.assertSimilar(decompose(2), null);
Test.assertSimilar(decompose(7), [2, 3, 6]);
Test.assertSimilar(decompose(11), [1, 2, 4, 10]);
Test.assertSimilar(decompose(50), [1, 3, 5, 8, 49]);
