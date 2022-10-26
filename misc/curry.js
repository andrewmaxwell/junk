const __ = {__: true};

const curry =
  (func, totalArgs = func.length) =>
  (...args) => {
    if (args.length >= totalArgs && !args.some((a) => a === __)) {
      return func(...args);
    }

    return curry((...restArgs) => {
      for (let i = 0, j = 0; i < args.length || j < restArgs.length; i++) {
        if (i >= args.length || (args[i] === __ && j < restArgs.length))
          args[i] = restArgs[j++];
      }
      return func(...args);
    }, totalArgs - args.length);
  };

const add3 = curry((a, b, c) => a - b / c);
console.log(add3(1, 2, 3));
console.log(add3(1, 2)(3));
console.log(add3(1)(2, 3));
console.log(add3(1)(2)(3));
console.log(add3(__, 2, 3)(1));
console.log(add3(__, 2, __)(1, 3));
console.log(add3(__, __, 3)(1, 2));
console.log(add3(1, 2, __)(3));
console.log(add3(__, 2)(1, 3));
console.log(add3(__, __, __, __)(1, 2, 3));
console.log(add3(__, 2)(__, 3)(1));
console.log(add3(__, __, 3)(__, 2)(1));
