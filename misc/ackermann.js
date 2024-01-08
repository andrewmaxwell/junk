const memo = {};
const memoize =
  (func) =>
  (...args) => {
    const key = JSON.stringify(args);
    if (memo[key] === undefined) {
      memo[key] = func(...args);
    }
    return memo[key];
  };

const A = memoize((m, n) => {
  if (!m) return n + 1;
  if (!n) return A(m - 1, 1);
  return A(m - 1, A(m, n - 1));
});

// console.log(A(3, 4));
// console.log(memo);
