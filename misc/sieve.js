function /* void */ sieve_of_eratosthenes(
  /* int */ limit,
  /* std::vector<int>& */ primes
) {
  let /* std::vector<bool> */ is_prime = new Array(limit + 1).fill(true);

  is_prime[0] = false;
  is_prime[1] = false;

  for (let /* int */ p = 2; p * p <= limit; ++p) {
    if (is_prime[p]) {
      for (let /* int */ i = p * p; i <= limit; i += p) {
        is_prime[i] = false;
      }
    }
  }

  for (let /* int */ i = 2; i <= limit; ++i) {
    if (is_prime[i]) {
      primes.push(i);
    }
  }
}

function /* int */ main() {
  const /* int */ limit = 1000000;
  let /* std::vector<int> */ primes = [];

  sieve_of_eratosthenes(limit, primes);

  for (let /* int */ prime of primes) {
    console.log(prime);
  }

  return 0;
}

main();
