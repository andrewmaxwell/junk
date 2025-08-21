// utils.js
// Math & small helpers — side-effect free, behavior identical to the C port

/** @typedef {{ a: [number, number, number, number] }} Q */
/** @typedef {{ x: Q, v: Q, m: number }} Particle */

/** Axis indices for Q.a */
export const X = 0,
  Y = 1,
  Z = 2,
  W = 3;

/** Create a new 4-vector.
 *  @param {number} [a0]
 *  @param {number} [a1]
 *  @param {number} [a2]
 *  @param {number} [a3]
 *  @returns {Q}
 */
export function qNew(a0 = 0, a1 = 0, a2 = 0, a3 = 0) {
  return {a: [a0, a1, a2, a3]};
}

/** @param {Q} dst @param {Q} src */
export function copyInto(dst, src) {
  dst.a[0] = src.a[0];
  dst.a[1] = src.a[1];
  dst.a[2] = src.a[2];
  dst.a[3] = src.a[3];
  return dst;
}

/** @param {Q} a @param {Q} b */
export function qAdd(a, b) {
  return qNew(
    a.a[0] + b.a[0],
    a.a[1] + b.a[1],
    a.a[2] + b.a[2],
    a.a[3] + b.a[3],
  );
}

/** IOCCC-ish multiply (verbatim logic).
 *  @param {Q} a @param {Q} b
 */
export function qMul(a, b) {
  const q = qNew();
  for (let kk = 16; kk--; ) {
    q.a[kk & 3] +=
      b.a[(kk / 4) | 0] *
      (1 - ((5432 >> kk) & 2)) *
      a.a[(19995 >> ((kk > 7 ? 15 - kk : kk) * 2)) & 3];
  }
  return q;
}

/** @param {Q} a @param {Q} b */
export function qDot(a, b) {
  let s = 0;
  for (let i = 0; i < 4; i++) s += a.a[i] * b.a[i];
  return s;
}

/** @param {Q} a @param {number} s */
export function qScale(a, s) {
  return qMul(a, qNew(0, 0, 0, s));
}

/** Normalize like the C code; zero-safe to avoid NaNs when the vector is 0. */
/** @param {Q} a */
export function qUnit(a) {
  const n2 = qDot(a, a);
  if (n2 === 0 || !Number.isFinite(n2)) {
    // Matches the C behavior when scaling a zero vector: returns zero vector.
    return qNew(0, 0, 0, 0);
  }
  const len = Math.sqrt(n2);
  if (!Number.isFinite(len) || len === 0) return qNew(0, 0, 0, 0);
  const inv = 1 / +len;
  return qScale(a, inv);
}

/**
 * Accumulate the alternating “shape” series used by the original.
 * IMPORTANT: Starts from caller-provided `initialH` (no cross-call state).
 * @param {number} Zfac
 * @param {Q["a"]} arr
 * @param {number} startIdx
 * @param {number} initialH
 */
export function accumSeriesFrom(Zfac, arr, startIdx, initialH) {
  let h = initialH;
  for (let kk = 1; kk < 99; kk++) {
    h = kk % 2 ? -h : h;
    arr[startIdx + (kk & 1)] += h;
    h *= Zfac / kk; // identical order to C's 'h*= Z/k++'
  }
}
