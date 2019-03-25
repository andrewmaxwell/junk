const {
  reduce,
  addIndex,
  mergeLeft,
  when,
  ifElse,
  pipe,
  gt,
  subtract,
  lt,
  propSatisfies,
  converge,
  prop,
  assoc,
  identity
} = window.R;

const hindsight = arr =>
  arr.reduce(
    ({buy, sell, pb}, x, i) =>
      x - arr[pb] > Math.max(x, arr[sell]) - arr[buy]
        ? {buy: pb, sell: i, pb}
        : {buy, sell: x > arr[sell] ? i : sell, pb: x < arr[pb] ? i : pb},
    {buy: 0, sell: 0, pb: 0}
  );

const hindsight2 = addIndex(reduce)(
  (res, val, i) =>
    pipe(
      when(propSatisfies(gt(val), 'sellV'), mergeLeft({sell: i, sellV: val})),
      ifElse(
        converge(gt, [
          pipe(
            prop('pBuyV'),
            subtract(val)
          ),
          converge(subtract, [prop('sellV'), prop('buyV')])
        ]),
        pipe(
          mergeLeft({sell: i, sellV: val}),
          converge(assoc('buy'), [prop('pBuy'), identity]),
          converge(assoc('buyV'), [prop('pBuyV'), identity])
        ),
        when(propSatisfies(lt(val), 'pBuyV'), mergeLeft({pBuy: i, pBuyV: val}))
      )
    )(res),
  {
    buy: 0,
    sell: 0,
    pBuy: 0,
    buyV: Infinity,
    sellV: -Infinity,
    pBuyV: Infinity
  }
);

// console.log(hindsight([500, 100, 5, 8, 9, 10, 2]));

[hindsight, hindsight2].forEach((func, i) => {
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
      [actual.buy, actual.sell].toString() !== exp.toString()
        ? `Func ${i}: Expected ${exp}, got: ${JSON.stringify(actual)}`
        : `Func ${i}: Good: ${exp}`
    );
  });
});
