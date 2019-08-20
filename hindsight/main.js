Object.assign(window, window.R);

const hindsight = arr =>
  arr.reduce(
    ({buy, sell, pb}, x, i) =>
      x - arr[pb] > Math.max(x, arr[sell]) - arr[buy]
        ? {buy: pb, sell: i, pb}
        : {buy, sell: x > arr[sell] ? i : sell, pb: x < arr[pb] ? i : pb},
    {buy: 0, sell: 0, pb: 0}
  );

const hindsightRamda = pipe(
  addIndex(chain)((v, i, arr) =>
    pipe(
      drop(i),
      addIndex(map)((w, j) => [i, j + i, w - v])
    )(arr)
  ),
  reduce(maxBy(last), [0, 0, 0]),
  zipObj(['buy', 'sell'])
);

[hindsight, hindsightRamda].forEach((func, i) => {
  [
    [[500, 100, 5, 8, 9, 10, 2], [2, 5]],
    [[5, 3, 8, 2, 7, 5, 3, 9, 6, 0], [3, 7]],
    [[100, 5, 10, 0], [1, 2]],
    [[10, 6, 32, 5, 4, 9, 2, 8, 0], [1, 2]],
    [[5, 4, 3, 2, 1], [0, 0]],
    [[93, 23, 4, 23, 994, 2, 94], [2, 4]]
  ].forEach(([arr, exp]) => {
    const actual = func(arr);
    console.log(
      equals([actual.buy, actual.sell], exp)
        ? `Func ${i}: Good: ${toString(exp)}`
        : `Func ${i}: Expected ${toString(exp)}, got: ${toString(actual)}`
    );
  });
});
