const input = `0 37551 469 63 1 791606 2065 9983586`.split(' ').map(Number);

let hits = 0;
let misses = 0;

const memoize =
  (func, cache = {}) =>
  (...args) => {
    if (cache[args] === undefined) {
      misses++;
      return (cache[args] = func(...args));
    } else {
      hits++;
      return cache[args];
    }
  };

const getLen = memoize((num, depth) => {
  if (!depth) return 1;
  if (num === 0) return getLen(1, depth - 1);

  const str = String(num);
  if (str.length % 2 === 0) {
    return (
      getLen(+str.slice(0, str.length / 2), depth - 1) +
      getLen(+str.slice(str.length / 2), depth - 1)
    );
  }

  return getLen(num * 2024, depth - 1);
});

console.log(
  'part1',
  input.map((x) => getLen(x, 25)).reduce((a, b) => a + b)
);

console.log(
  'part2',
  input.map((x) => getLen(x, 75)).reduce((a, b) => a + b)
);

console.log(hits, misses, hits / (hits + misses));
