let x = 3n * 10n ** 1020n;
let pi = x;
for (let i = 1n; x > 0; i += 2n) {
  x = (x * i) / ((i + 1n) * 4n);
  pi += x / (i + 2n);
}
console.log(pi / 10n ** 20n);
