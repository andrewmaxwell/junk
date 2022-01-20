const intersects = (a, b) => {
  if (a.size > b.size) {
    for (const x of b) {
      if (a.has(x)) return true;
    }
  } else {
    for (const x of a) {
      if (b.has(x)) return true;
    }
  }
  return false;
};

const getLeastCommonVal = (sets, nums) => {
  const counts = {};
  for (const s of sets) {
    for (const x of s) {
      counts[x] = (counts[x] || 0) + 1;
    }
  }

  let num;
  let min = Infinity;
  for (const x of nums) {
    const c = counts[x];
    if (!c) return;
    if (c >= min) continue;
    min = c;
    num = x;
  }
  return num;
};

const solve = (sets, nums) => {
  if (!nums.length) return [[]];

  const num = getLeastCommonVal(sets, nums);
  if (num === undefined) return;

  const result = [];
  for (const s of sets) {
    if (!s.has(num)) continue;

    const solutions = solve(
      sets.filter((t) => t !== s && !intersects(s, t)),
      nums.filter((x) => !s.has(x))
    );
    if (solutions) {
      for (const o of solutions) {
        result.push([s, ...o]);
      }
    }
  }
  return result;
};

const result = solve(
  [
    new Set(['a', 4, 7]),
    new Set(['a', 4]),
    new Set([4, 5, 7]),
    new Set([3, 5, 6]),
    new Set([2, 3, 6, 7]),
    new Set([2, 7]),
    new Set([2, 3, 6]),
    new Set([5]),
  ],
  ['a', 2, 3, 4, 5, 6, 7]
);

console.log(result);
