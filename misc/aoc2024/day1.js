const vals = `3   4
4   3
2   5
1   3
3   9
3   3`
  .split('\n')
  .map((r) => r.split(/\s+/));

const left = vals.map((r) => r[0]).sort((a, b) => a - b);
const right = vals.map((r) => r[1]).sort((a, b) => a - b);
console.log(
  'part 1',
  left.reduce((a, b, i) => a + Math.abs(b - right[i]), 0)
);

const freq = {};
vals.forEach(([, b]) => (freq[b] = (freq[b] || 0) + 1));
console.log(
  'part 2',
  vals.reduce((total, [a]) => total + a * (freq[a] || 0), 0)
);
