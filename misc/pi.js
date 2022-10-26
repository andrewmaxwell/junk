// let x = 3n * 10n ** 1020n;
// let pi = x;
// for (let i = 1n; x > 0; i += 2n) {
//   x = (x * i) / ((i + 1n) * 4n);
//   pi += x / (i + 2n);
// }
// console.log(pi / 10n ** 20n);

let a = 10000;
let b;
let c = 2800;
let d;
let e;
let f = new Array(c + 1);
let g;

for (; b - c; ) {
  f[b++] = a / 5;
}
for (; (d = 0), (g = c * 2); c -= 14, console.log(e + d / a), e = d % a)
  for (b = c; (d += f[b] * a), (f[b] = d % --g), (d /= g--), --b; d *= b);
