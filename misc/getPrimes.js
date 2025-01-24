export const getPrimes = (limit) => {
  const isNotPrime = new Uint16Array(limit);
  for (let p = 2; p * p <= limit; ++p) {
    if (isNotPrime[p]) continue;
    for (let i = p * p; i <= limit; i += p) isNotPrime[i] = 1;
  }
  const primes = [];
  for (let i = 2; i < limit; i++) {
    if (!isNotPrime[i]) primes.push(i);
  }
  return primes;
};

console.log(getPrimes(1000).join(','));
