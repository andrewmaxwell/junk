const Y = (fn) => ((x) => x(x))((self) => (val) => fn(self(self))(val));

const M = (x) => x(x);

class Thunk {
  constructor(fn, ...args) {
    this.fn = fn;
    this.args = args;
  }
  evaluate() {
    return this.fn(...this.args);
  }
}

const thunkify =
  (fn) =>
  (...args) =>
    new Thunk(fn, ...args);

const makeInitialValue = (fn) =>
  M(
    (maker) =>
      (...args) =>
        fn(thunkify(M(maker)), ...args)
  );

const tailCallOptimize =
  (fn) =>
  (...args) => {
    let value = makeInitialValue(fn)(...args);

    while (value instanceof Thunk) {
      value = value.evaluate();
    }

    return value;
  };

const factorial = tailCallOptimize((self, n, acc = 1) =>
  n ? self(n - 1, n * acc) : acc
);

console.log(factorial(4)); // -> 24
