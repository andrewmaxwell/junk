const fib = (n) => {
  if (!n) return 0n;
  let a = 0n;
  let b = 1n;
  const abs = n < 0 ? -n : n;
  for (let i = 1; i < abs; i++) {
    [a, b] = [b, a + b];
  }
  const result = n < 0 && n % 2 === 0 ? -b : b;
  return result;
};

const fib2 = (n) => {
  if (!n) return 0n;
  let a = 0n;
  let b = 1n;
  const abs = n < 0 ? -n : n;
  for (let i = 1; i < abs; i++) {
    [a, b] = [b, a + b];
  }
  const result = n < 0 && n % 2 === 0 ? -b : b;
  return result;
};

for (let i = 1; i < 101; i++) {
  console.log(i, fib(i), fib2(i));
}
