export const sieve = (limit) => {
  const isPrime = new Array(limit).fill(1);
  isPrime[0] = isPrime[1] = 0;
  for (let p = 2; p * p <= limit; ++p) {
    if (!isPrime[p]) continue;
    for (let i = p * p; i <= limit; i += p) isPrime[i] = 0;
  }
  return isPrime;
};
