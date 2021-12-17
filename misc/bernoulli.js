console.clear();

const bernoulli = (n) => {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr[i] = 1 / (i + 1);
    for (let j = i - 1; j >= 0; j--) {
      arr[j] = (j + 1) * (arr[j] - arr[j + 1]);
    }
  }
  return arr[0];
};

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

const {Test} = require('./test');
for (let i = 0; i < 20; i++) {
  Test.assertDeepEquals(B(i), bernoulli(i));
}
