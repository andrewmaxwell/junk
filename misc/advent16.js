/*

0  1  2  3  4  5  6  7  8  9 10
1  0 -1  0  1  0 -1  0  1  0 -1 (n = 1)
0  1  1  0  0 -1 -1  0  0  1  1 (n = 2)
0  0  1  1  1  0  0  0 -1 -1 -1 (n = 3)
0  0  0  1  1  1  1  0  0  0  0 (n = 4)

*/

const mult = (input, n, len) => {
  let sum = 0;

  // for (let i = 0; i < len; i += n * 4) {
  //   for (let j = 0; j < n; j++) {
  //     sum += input[i + j + n - 1] - input[i + j + n - 1 + n * 2];
  //   }
  // }

  for (let j = n - 1; j < len; j++) {
    const x = (j + 1) % (4 * n);
    if (x >= n && x < 2 * n) sum += input[j];
    else if (x >= 3 * n) sum -= input[j];
  }
  return Math.abs(sum % 10);
};

const phase = (input, len) => {
  for (let i = 0; i < len; i++) input[i] = mult(input, i + 1, len);
};

const input = '80871224585914546619083218645595';

const res = Uint8Array.from(input);
const len = res.length;

for (let i = 0; i < 100; i++) phase(res, len);

const result = res.slice(0, 8).join('');
console.log(result, result == 24176176);

// const input = '02935109699940807407585447034323';

// const res = Uint8Array.from(input.repeat(10000));
// const len = res.length;
// for (let i = 0; i < 100; i++) phase(res, len);
// const offset = Number(input.slice(0, 7));
// const result = res.slice(offset, offset + 8).join('');
// console.log(result, result == 84462026);
