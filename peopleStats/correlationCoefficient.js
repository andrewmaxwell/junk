export const correlationCoefficient = (arr1, arr2) => {
  const n = arr1.length;
  let sum1 = 0;
  let sum2 = 0;
  let sum1Sq = 0;
  let sum2Sq = 0;
  let pSum = 0;

  for (let i = 0; i < n; i++) {
    sum1 += arr1[i];
    sum2 += arr2[i];
    sum1Sq += arr1[i] ** 2;
    sum2Sq += arr2[i] ** 2;
    pSum += arr1[i] * arr2[i];
  }

  const denominator = Math.sqrt(
    (sum1Sq - sum1 ** 2 / n) * (sum2Sq - sum2 ** 2 / n)
  );

  return denominator ? (pSum - (sum1 * sum2) / n) / denominator : 0;
};

// console.log(correlationCoefficient([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]));
// console.log(correlationCoefficient([1, 2, 3, 4, 5], [0, 0, 0, 0, 0]));
// console.log(
//   correlationCoefficient(
//     [1, 2, 3, 4, 5],
//     [-1 / 2, -2 / 2, -3 / 2, -4 / 2, -5 / 2]
//   )
// );
