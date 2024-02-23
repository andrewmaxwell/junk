const memoize =
  (func, memo = {}) =>
  (...args) => {
    const key = JSON.stringify(args);
    if (memo[key] === undefined) {
      memo[key] = func(...args);
    }
    console.log(`ackerman(${args[0]},${args[1]}) = ${memo[key]}`);
    return memo[key];
  };

const ackerman = memoize((m, n) => {
  if (!m) return n + 1;
  if (!n) return ackerman(m - 1, 1);
  return ackerman(m - 1, ackerman(m, n - 1));
});

console.log(ackerman(2, 2));
// console.log(memo);
