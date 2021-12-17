const fac = (x) => (x < 2 ? 1 : x * fac(x - 1));

const _sin = (x, n) =>
  n < 0 ? 0 : ((-1) ** n * x ** (n * 2 + 1)) / fac(n * 2 + 1) + _sin(x, n - 1);

const sin = (x) => _sin(x, 32);

const _cos = (x, n) =>
  n < 0 ? 0 : ((-1) ** n * x ** (n * 2)) / fac(n * 2) + _cos(x, n - 1);

const cos = (x) => _cos(x, 32);

const _sqrt = (a, x, n) => (n ? _sqrt(a, (x + a / x) / 2, n - 1) : x);
const sqrt = (x) => _sqrt(x, 1, 64);

const _ln = (x, n) =>
  n ? _ln(x, n - 1) + ((-1) ** (n + 1) * (x - 1) ** n) / n : 0;

const ln = (x) => _ln(x, 64);

const _e = (p) => (p ? 1 / fac(p) + _e(p - 1) : 1);
const e = () => _e(16);

// const B = (n) => {
//   const A = [];
//   for (let m = 0; m <= n; m++) {
//     A[m] = 1 / (m + 1);
//     for (let j = m; j > 0; j--) {
//       A[j - 1] = j * (A[j - 1] - A[j]);
//     }
//   }
//   return A[0];
// };
const range = (start, end) =>
  start < end ? [start, ...range(start + 1, end)] : [];
const reverseRange = (start, end) =>
  start < end ? [end - 1, ...reverseRange(start, end - 1)] : [];
const setIndex = (index, value, [head, ...tail]) =>
  index ? [head, ...setIndex(index - 1, value, tail)] : [value, ...tail];

const _B1 = (arr, i) => setIndex(i, (i + 1) * (arr[i] - arr[i + 1]), arr);
const _B0 = (arr, i) =>
  reverseRange(0, i).reduce(_B1, setIndex(i, 1 / (i + 1), arr));
const B = (n) => range(0, n).reduce(_B0, [])[0];
const _tan = (x, n) =>
  n
    ? _tan(x, n - 1) +
      ((-1) ** (n - 1) *
        2 ** (2 * n) *
        (2 ** (2 * n) - 1) *
        B(2 * n) *
        x ** (2 * n - 1)) /
        fac(2 * n)
    : 0;
const tan = (x) => _tan(x, 16);

const doubleFac = (n) => (n < 2 ? 1 : n * doubleFac(n - 2));
const _pi = (n) =>
  n >= 0
    ? (doubleFac(2 * n) / doubleFac(2 * n + 1)) * 0.5 ** n + _pi(n - 1)
    : 0;
const pi = () => 2 * _pi(32);

const _exp = (x, n) => (n ? _exp(x, n - 1) + x ** n / fac(n) : 1);
const exp = (x) => _exp(x, 64);

const _arctan = (x, n) =>
  n ? _arctan(x, n - 1) + ((-1) ** n / (2 * n + 1)) * x ** (2 * n + 1) : x;
const arctan = (x) => _arctan(x, 32);

const tests = [
  [sin, Math.sin, 0, 2 * Math.PI],
  [cos, Math.cos, 0, 2 * Math.PI],
  [sqrt, Math.sqrt, 0, 100],
  [ln, Math.log, 0.25, 1.75],
  [e, () => Math.E, 0, 1],
  [pi, () => Math.PI, 1, 10],
  [exp, Math.exp, -10, 10],
  // [arctan, Math.atan, -1, 1],
  [tan, Math.tan, -Math.PI, Math.PI],
];

const num = 100;
for (let i = 0; i < num; i++) {
  for (const [myFunc, realFunc, start, end] of tests) {
    const x = start + (i / num) * (end - start);
    const actual = myFunc(x);
    const expected = realFunc(x);
    if (Math.abs(actual - expected) > 0.000000001) {
      console.error(
        `For ${myFunc.name}(${x}), expected ${expected}, got ${actual}`
      );
    }
  }
}
