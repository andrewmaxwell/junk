export const makeGrid = (width, height, initialValue = 0) =>
  Array.from({length: height}, () => Array(width).fill(initialValue));

export const sigma = (x, a, alpha) =>
  1 / (1 + Math.exp((-4 / alpha) * (x - a)));

export const sigma2 = (x, a, b, ALPHA_N) =>
  sigma(x, a, ALPHA_N) * (1 - sigma(x, b, ALPHA_N));

export const lerp = (a, b, t) => (1 - t) * a + t * b;

export const fieldMultiply = (width, height, a, b, c) => {
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      const t = a.re[i][j] * (b.re[i][j] + b.im[i][j]);
      c.re[i][j] = t - b.im[i][j] * (a.re[i][j] + a.im[i][j]);
      c.im[i][j] = t + b.re[i][j] * (a.im[i][j] - a.re[i][j]);
    }
  }
};
