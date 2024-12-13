const fft = (dir, m, x, y) => {
  const nn = x.length;
  let j = 0;

  for (let i = 0; i < nn - 1; i++) {
    if (i < j) [x[i], x[j], y[i], y[j]] = [x[j], x[i], y[j], y[i]];
    let k = nn >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  let c1 = -1.0;
  let c2 = 0.0;
  let l2 = 1;
  for (let l = 0; l < m; l++) {
    const l1 = l2;
    l2 <<= 1;
    let u1 = 1.0;
    let u2 = 0.0;
    for (let j = 0; j < l1; j++) {
      for (let i = j; i < nn; i += l2) {
        const i1 = i + l1;
        const t1 = u1 * x[i1] - u2 * y[i1];
        const t2 = u1 * y[i1] + u2 * x[i1];
        [x[i1], y[i1], x[i], y[i]] = [
          x[i] - t1,
          y[i] - t2,
          x[i] + t1,
          y[i] + t2,
        ];
      }
      const z = u1 * c1 - u2 * c2;
      u2 = u1 * c2 + u2 * c1;
      u1 = z;
    }
    c2 = Math.sqrt((1 - c1) / 2);
    if (dir === 1) c2 = -c2;
    c1 = Math.sqrt((1 + c1) / 2);
  }

  if (dir === -1) {
    const scale = 1.0 / nn;
    x.forEach((_, i) => {
      x[i] *= scale;
      y[i] *= scale;
    });
  }
};

// In place 2D fft
export const fft2 = (dir, m, f) => {
  f.re.forEach((row, i) => fft(dir, m, row, f.im[i]));
  [f.re, f.im].forEach((matrix) =>
    matrix.forEach((_, i) => {
      for (let j = 0; j < i; j++)
        [matrix[i][j], matrix[j][i]] = [matrix[j][i], matrix[i][j]];
    })
  );
  f.re.forEach((row, i) => fft(dir, m, row, f.im[i]));
};
