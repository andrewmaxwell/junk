const numberOfDigits = 100n;

let x = 3n * 10n ** (numberOfDigits + 10n);
let pi = x;
for (let i = 1n; x > 0; i += 2n) {
  x = (x * i) / ((i + 1n) * 4n);
  pi += x / (i + 2n);
}
pi /= 10n ** 10n;
console.log(pi);

/*
x = 3e100
pi = x
for (i = 1; x > 0; i += 2) {
  x = (x * i) / (i + 1) / 4
  pi = pi + x / (i + 2)
}

*/
