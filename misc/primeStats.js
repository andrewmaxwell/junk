const sumOfDigits = (x, base = 10) => {
  let t = 0;
  while (x) {
    t += x % base;
    x = Math.floor(x / base);
  }
  return t;
};
const repeatedSumOfDigits = (x) => {
  while (x > 9) x = sumOfDigits(x);
  return x;
};

const max = 1e9;
const nums = Buffer.alloc(max);
const primes = [];

for (let i = 2; i < max; ) {
  primes.push(i);
  for (let j = i * i; j < max; j += i) nums[j] = 1;
  while (nums[++i]);
}

const stats = {};
for (const p of primes) {
  // const digits = p.toString();

  // first digit
  // const x = digits[0];
  // stats[x] = (stats[x] || 0) + 1;

  // second-to-last digit
  // const x = digits.slice(-2, -1);
  // stats[x] = (stats[x] || 0) + 1;

  // last digits
  // for (let i = 1; i < digits.length; i++) {
  //   const last = digits.slice(-i);
  //   stats[last] = (stats[last] || 0) + 1;
  // }

  // sum of digits
  const x = repeatedSumOfDigits(p);
  stats[x] = (stats[x] || 0) + 1;
}

const result = Object.entries(stats)
  .map(([key, val]) => ({key, val: (val * 100) / primes.length}))
  // .filter(({val}) => val > 0.5)
  .sort((a, b) => b.val - a.val)
  .map(({key, val}) => `${key}: ${val}%`)
  .join('\n');

console.log(result);
