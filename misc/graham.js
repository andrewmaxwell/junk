const upArrow = (a, b, arrows) => {
  if (arrows === 1) return a ** b;
  if (b === 1) return a;
  return upArrow(a, upArrow(a, b - 1, arrows), arrows - 1);
};

const g = (n) => upArrow(3, 3, n ? g(n - 1) : 4);

const grahamsNumber = g(64);

console.log(grahamsNumber);
