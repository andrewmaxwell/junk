export const objMap = (func, obj) => {
  const res = {};
  for (const key in obj) res[key] = func(obj[key], key, obj);
  return res;
};

export const interp = (a, b, v) => a * v + b * (1 - v);
