/** @type {(arr: any[]) => number} */
export const randIndex = (arr) => Math.floor(Math.random() * arr.length);

/** @type {<T>(arr: T[]) => T} */
export const randEl = (arr) => arr[randIndex(arr)];

/** @type {(date: Date) => string} */
export const formatDate = (date) =>
  [date.getMonth() + 1, date.getDate(), date.getFullYear()].join('/');
