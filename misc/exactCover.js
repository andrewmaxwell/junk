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

const solve = (sets, acc = []) => {
  if (!sets.length) return acc;

  const counts = new Map();
  for (const s of sets) {
    for (const x of s) {
      counts[x] = (counts[x] || 0) + 1;
      counts.set(x, (counts.get(x) || 0) + 1);
    }
  }

  let num;
  let min = Infinity;
  for (const [x, c] of counts) {
    if (c >= min) continue;
    min = c;
    num = x;
  }

  console.log('num', num);
  for (const s of sets) {
    if (!s.has(num)) continue;

    const solution = solve(
      // TODO: return false if this filter will remove all of any number that is not num
      sets.filter((t) => t !== s && !intersects(s, t)),
      [...acc, s]
    );
    if (solution) return solution;
  }
};

const result = solve([
  new Set([1, 4, 7]),
  new Set([1, 4]),
  new Set([4, 5, 7]),
  new Set([3, 5, 6]),
  new Set([2, 3, 6, 7]),
  new Set([2, 7]),
]);

console.log(result);
