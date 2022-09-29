const numSteps = (n) => {
  let count = 0;
  while (n !== 1) {
    n = n % 2 ? n * 3 + 1 : n / 2;
    count++;
  }
  return count;
};

const maxStep = (n) => {
  let max = n;
  while (n !== 1) {
    n = n % 2 ? n * 3 + 1 : n / 2;
    max = Math.max(max, n);
  }
  return max;
};

let best = 0;

for (let i = 2; i < 1e7; i++) {
  const x = maxStep(i);
  if (x > best) {
    best = x;
    console.log(i, maxStep(i).toLocaleString(), numSteps(i));
  }
}
