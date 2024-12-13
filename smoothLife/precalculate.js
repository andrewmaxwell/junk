import {fft2} from './fft2.js';
import {makeGrid} from './utils.js';

// Initialize kernel
const BesselJ = (radius, width, height, logRes) => {
  const field = makeGrid(width, height);
  let weight = 0;
  field.forEach((row, i) =>
    row.forEach((_, j) => {
      const ii = ((i + width / 2) % width) - width / 2;
      const jj = ((j + height / 2) % height) - height / 2;
      const r = Math.sqrt(ii * ii + jj * jj) - radius;
      const v = 1 / (1 + Math.exp(logRes * r));
      weight += v;
      field[i][j] = v;
    })
  );

  const imagField = makeGrid(width, height);
  fft2(1, logRes, {re: field, im: imagField});
  return {re: field, im: imagField, w: weight};
};

export const precalculate = (innerRad, outerRad, width, height, logRes) => {
  const inner = BesselJ(innerRad, width, height, logRes);
  const outer = BesselJ(outerRad, width, height, logRes);
  const inner_w = 1 / inner.w;
  const outer_w = 1 / (outer.w - inner.w);

  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      outer.re[i][j] = outer_w * (outer.re[i][j] - inner.re[i][j]);
      outer.im[i][j] = outer_w * (outer.im[i][j] - inner.im[i][j]);
      inner.re[i][j] *= inner_w;
      inner.im[i][j] *= inner_w;
    }
  }

  // return {M_re: inner.re, M_im: inner.im, N_re: outer.re, N_im: outer.im};
  return {inner, outer};
};
