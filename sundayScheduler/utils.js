/**
 * Utility for picking a random index from an array.
 * @param {any[]} arr
 * @returns {number}
 */
export const randIndex = (arr) => Math.floor(Math.random() * arr.length);

/**
 * Picks a random element from an array.
 * @template T
 * @param {T[]} arr
 * @returns {T}
 */
export const randEl = (arr) => arr[randIndex(arr)];
