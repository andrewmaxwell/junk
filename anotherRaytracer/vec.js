// 3D vectors as arrays of three numbers

/** @type {(a: number[], b: number[]) => number} */
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** @type {(a: number[], b: number[]) => number[]} */
export const cross = ([ax, ay, az], [bx, by, bz]) => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
];

/** @type {(a: number[], b: number[]) => number[]} */
export const sub = (a, b) => a.map((x, i) => x - b[i]);

/** @type {(v: number[]) => number[]} */
export const normalize = (v) => {
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
};
