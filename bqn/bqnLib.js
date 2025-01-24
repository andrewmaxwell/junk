export const add = (a, b) => {
  if (typeof a === 'string' || typeof b === 'string') {
    return String.fromCharCode(
      (typeof a === 'string' ? a.charCodeAt(0) : a) +
        (typeof b === 'string' ? b.charCodeAt(0) : b)
    );
  }
  return a + b;
};
export const subtract = (a, b) => {
  if (b === null || b === undefined) {
    b = a;
    a = 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.charCodeAt(0) - b.charCodeAt(0);
  }
  if (typeof a === 'string' || typeof b === 'string') {
    return String.fromCharCode(
      (typeof a === 'string' ? a.charCodeAt(0) : a) -
        (typeof b === 'string' ? b.charCodeAt(0) : b)
    );
  }
  return a - b;
};
export const multiply = (a, b) => a * b;
export const divide = (a, b) => a / b;
export const power = (a, b) => (a ?? Math.E) ** b;
export const log = (a, b) => Math.log(b) / Math.log(a ?? Math.E);
export const root = (a, b) => b ** (1 / (a ?? 2));
export const square = (a, b) => b ** (a ?? 2);

export const swap = (func) => (a, b) => func(b ?? a, a ?? b);
export const compose =
  (...funcs) =>
  (...args) => {
    let result = funcs[funcs.length - 1](...args);
    for (let i = funcs.length - 2; i >= 0; i--) result = funcs[i](result);
    return result;
  };

export const inverseFuncs = new Map([
  [add, subtract],
  [subtract, add],
  [multiply, divide],
  [divide, multiply],
  [power, log],
  [log, power],
  [root, square],
]);
export const undo = (func) => {
  if (!inverseFuncs.has(func)) {
    throw new Error(`Unknown inverse function (using undo): ${func}`);
  }
  return inverseFuncs.get(func);
};
