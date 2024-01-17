const max = 1e7;

const getNumPrimes = (max) => {
  const nums = [];
  let result = 0;
  for (let c = 2; c < max / 2; ) {
    result++;
    for (let i = c * c; i < max; i += c) nums[i] = true;
    while (nums[++c]);
  }
  return result;
};

const median = (arr) => {
  arr.sort((a, b) => a - b);
  return arr.length % 2
    ? arr[Math.floor(arr.length / 2)]
    : (arr[arr.length / 2] + arr[arr.length / 2 - 1]) / 2;
};

const times = [];

const loop = () => {
  const start = performance.now();
  getNumPrimes(max);
  times.push(Math.round(performance.now() - start));

  document.querySelector('#result').innerHTML = `${Math.round(
    median(times)
  )}ms to find the primes less than ${max.toLocaleString()}`;

  if (times.length < 1000) requestAnimationFrame(loop);
};

loop();
