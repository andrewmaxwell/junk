/**
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 */

/**
 * @param {number} x
 * @returns {number}
 */
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/**
 * @param {Point[]} coords
 * @param {number} [steps=16]
 * @returns {Point[]}
 */
export const smoothLine = (coords, steps = 16) => {
  const result = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const c = coords[i];
    const n = coords[i + 1];
    result.push(c);
    for (let j = 0; j < steps; j++) {
      result.push({
        x: c.x + (j / steps) * (n.x - c.x),
        y: c.y + ease(j / steps) * (n.y - c.y),
      });
    }
  }
  return result;
};

/**
 * Gaussian-kernel smoothing of sparse points across integer x = 0..length-1.
 * Assumes coords is sorted by x ascending.
 *
 * @param {{x:number,y:number}[]} coords
 * @param {number} length
 * @param {number} radius  Window half-width (limits work; weights outside are ignored)
 * @param {number} [sigma=radius/3]  Std dev of Gaussian (smaller = sharper, larger = smoother)
 * @returns {{x:number,y:number}[]}
 */
export const smootherLineGaussian = (
  coords,
  length,
  radius,
  sigma = radius / 3,
) => {
  if (!Array.isArray(coords) || coords.length === 0 || length <= 0) return [];
  if (!(radius > 0)) throw new Error('radius must be > 0');
  if (!(sigma > 0)) throw new Error('sigma must be > 0');

  const last = coords.length - 1;
  let left = 0;
  let right = 0;

  const inv2Sigma2 = 1 / (2 * sigma * sigma);

  /** @param {number} x */
  const nearestY = (x) => {
    const li = Math.max(0, Math.min(last, left));
    const ri = Math.max(0, Math.min(last, right));
    return Math.abs(x - coords[ri].x) < Math.abs(x - coords[li].x)
      ? coords[ri].y
      : coords[li].y;
  };

  return Array.from({length}, (_, x) => {
    while (left < last && coords[left].x < x - radius) left++;
    while (right < last && coords[right].x <= x + radius) right++;

    let sum = 0;
    let total = 0;

    for (let i = left; i <= right; i++) {
      const d = x - coords[i].x;
      const w = Math.exp(-(d * d) * inv2Sigma2);
      total += w;
      sum += coords[i].y * w;
    }

    return {x, y: total ? sum / total : nearestY(x)};
  });
};
