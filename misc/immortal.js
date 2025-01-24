// function elderAge(m, n, l, t) {
//   let result = 0;
//   for (let i = 0; i < m; i++) {
//     for (let j = 0; j < n; j++) {
//       result = (result + Math.max(0, (i ^ j) - l)) % t;
//     }
//   }
//   return result;
// }

const nextPowerOfTwo = (x) => 2 ** Math.ceil(Math.log2(x));

const rangeSum = (start, end) =>
  end < start ? 0 : Math.floor(((start + end) * (end - start + 1)) / 2);

const elderAge = (width, height, loss, mod) => {
  if (!width || !height) return 0;
  if (width > height) [width, height] = [height, width];

  const nextPowW = nextPowerOfTwo(width);
  const nextPowH = nextPowerOfTwo(height);

  const remainingH = nextPowH - height;
  const minusLossH = nextPowH - loss - 1;
  const halfH = nextPowH / 2;
  const minusLossHalfH = halfH - loss;
  const remainingW = halfH - width;

  if (loss > nextPowH || nextPowW > nextPowH) return 0;

  if (nextPowW === nextPowH) {
    return (
      (rangeSum(1, minusLossH) * (width - remainingH) +
        elderAge(remainingH, nextPowW - width, loss, mod)) %
      mod
    );
  }

  return (
    (rangeSum(1, minusLossH) * width -
      remainingH * rangeSum(Math.max(minusLossHalfH, 0), minusLossH) +
      (loss <= halfH
        ? minusLossHalfH * remainingW * remainingH +
          elderAge(remainingW, remainingH, 0, mod)
        : elderAge(remainingW, remainingH, -minusLossHalfH, mod))) %
    mod
  );
};

import {Test} from './test.js';
Test.failFast = true;

// Test.assertEquals(elderAge(8, 5, 1, 100), 5);
// Test.assertEquals(elderAge(8, 8, 0, 100007), 224);
// Test.assertEquals(elderAge(25, 31, 0, 100007), 11925);
// Test.assertEquals(elderAge(5, 45, 3, 1000007), 4323);
// Test.assertEquals(elderAge(31, 39, 7, 2345), 1586);
// Test.assertEquals(elderAge(545, 435, 342, 1000007), 808451);
Test.assertEquals(
  elderAge(28827050410, 35165045587, 7109602, 13719506),
  5456283
);
