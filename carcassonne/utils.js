export const pipe =
  (...funcs) =>
  (data) =>
    funcs.reduce((r, f) => f(r), data);
export const when = (pred, func) => (data) => (pred(data) ? func(data) : data);
export const last = (arr) => arr[arr.length - 1];
export const repeat = (num, val) => new Array(num).fill(val);

export const assocPath =
  ([first, ...rest], val) =>
  (data) => {
    const copy = Array.isArray(data) ? [...data] : {...data};
    copy[first] = rest.length ? assocPath(rest, val)(data[first]) : val;
    return copy;
  };

export const shuffle = (arr) => {
  for (let counter = arr.length; counter > 0; ) {
    const index = Math.floor(Math.random() * counter--);
    [arr[counter], arr[index]] = [arr[index], arr[counter]];
  }
  return arr;
};

export const randEl = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const minBy = (func, arr) => {
  let result = arr[0];
  let min = func(arr[0]);
  for (let i = 1; i < arr.length; i++) {
    let val = func(arr[i]);
    if (val < min) {
      min = val;
      result = arr[i];
    }
  }
  return result;
};

export const rotate = (t, piece) => piece.slice(4 - t) + piece.slice(0, 4 - t);
