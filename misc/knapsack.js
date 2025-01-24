function knapsack(capacity, sizes) {
  const memo = [];
  for (let i = 0; i <= sizes.length; i++) {
    memo[i] = [];
    for (let j = 0; j <= capacity; j++) {
      memo[i][j] = 0;
    }
  }

  for (let i = 1; i <= sizes.length; i++) {
    for (let j = 1; j <= capacity; j++) {
      memo[i][j] =
        sizes[i - 1] <= j
          ? Math.max(
              memo[i - 1][j],
              memo[i - 1][j - sizes[i - 1]] + sizes[i - 1]
            )
          : memo[i - 1][j];
    }
  }

  const chosenItems = [];
  for (let i = sizes.length, j = capacity; i > 0 && j > 0; i--) {
    if (memo[i][j] === memo[i - 1][j]) continue;
    chosenItems.push(sizes[i - 1]);
    j -= sizes[i - 1];
  }

  return chosenItems.reverse();
}

// console.log(knapsack(100, [17, 18, 22, 13, 23, 11, 34, 51]));
console.log(knapsack(10, [3, 3, 3, 2, 2]));
