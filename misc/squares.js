// https://www.codewars.com/kata/54eb33e5bc1a25440d000891/train/javascript

const decompose = (n) => {
  if (n < 0) return null;
  if (n === 0) return [];
  if (n === 1) return [1];
  for (let i = Math.ceil(n - 1); i > 1; i--) {
    const x = n * n - i * i;
    const rest = decompose(Math.sqrt(x));
    if (rest) return [...rest, i];
  }
  return null;
};

const {Test} = require('./test');
Test.assertSimilar(decompose(1), [1]);
Test.assertSimilar(decompose(2), null);
Test.assertSimilar(decompose(7), [2, 3, 6]);
// Test.assertSimilar(decompose(11), [1, 2, 4, 10]);
// Test.assertSimilar(decompose(50), [1, 3, 5, 8, 49]);
