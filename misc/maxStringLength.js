let min = 0;
let max = 1e9;

while (min + 1 < max) {
  const n = Math.round((min + max) / 2);
  try {
    'f'.repeat(n);
    min = n;
  } catch {
    max = n;
  }
  console.log(min, max);
}
