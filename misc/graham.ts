function upArrows(base: number, exponent: number, arrowCount: number) {
  if (arrowCount === 1) return base ** exponent;
  if (exponent === 1) return base;
  let result = base;
  for (let i = 1; i < exponent; i++) {
    result = upArrows(base, result, arrowCount - 1);
  }
  return result;
}

function g(n: number) {
  let arrowCount = 4;
  for (let i = 0; i < n; i++) arrowCount = upArrows(3, 3, arrowCount);
  return arrowCount;
}

console.log("graham's number:", g(64));
