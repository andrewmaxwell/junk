export const memoize =
  (func, cache = {}) =>
  (...args) => {
    const key = JSON.stringify(args);
    if (!cache.hasOwnProperty(key)) cache[key] = func(...args);
    return cache[key];
  };
