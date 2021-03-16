// Add your code here

const getPositionAt = (n, step = 2, position = -1, last = -2, pen = 1) => {
  if (n < 2) return n;
  if (n == 2) return -1;
  return step === n
    ? position
    : getPositionAt(n, step + 1, position + last - pen, last - pen, last);
};

const myVersion = (n) => (n < 0 ? n : [0, 1, -1, -4, -5, -3][n % 6]);

for (let i = -100; i <= 100; i++) {
  console.log(
    i,
    getPositionAt(i),
    myVersion(i),
    getPositionAt(i) === myVersion(i)
  );
}
