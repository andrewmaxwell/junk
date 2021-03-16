const memoize = (f, c = {}) => (...a) => (c[a] = c[a] || f(...a));

const distributionOf = memoize((g, turn = 0) => {
  if (!g.length) return [0, 0];

  const [a, b] = distributionOf(g.slice(1), 1 - turn);
  const [c, d] = distributionOf(g.slice(0, -1), 1 - turn);
  const f = g[0];
  const l = g[g.length - 1];

  return turn
    ? b + f > d + l
      ? [a, b + f]
      : [c, d + l]
    : a + f > c + l
    ? [a + f, b]
    : [c + l, d];
});

const {Test} = require('./test');
// Test.assertDeepEquals(distributionOf([18]), [18, 0]);
Test.assertDeepEquals(distributionOf([18, 5]), [18, 5]);
Test.assertDeepEquals(distributionOf([4, 7, 2, 9, 5, 2]), [18, 11]);

Test.assertDeepEquals(distributionOf([10, 1000, 2, 1]), [1001, 12]);

Test.assertDeepEquals(distributionOf([10, 1000, 2]), [12, 1000]);

Test.assertDeepEquals(
  distributionOf([140, 649, 340, 982, 105, 86, 56, 610, 340, 879]),
  [3206, 981]
);
