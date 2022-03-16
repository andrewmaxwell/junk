export const treeMap = (func, ob, path = []) => {
  const newTree = func(ob, path);
  if (!newTree || typeof newTree !== 'object') return newTree;
  const res = Array.isArray(newTree) ? [] : {};
  for (const key in newTree) {
    res[key] = treeMap(func, newTree[key], [...path, key]);
  }
  return res;
};

export const eachNode = (func, ob) => {
  func(ob);
  if (ob && typeof ob === 'object') {
    for (const key in ob) eachNode(func, ob[key]);
  }
};

// export const deepEq = (a, b) =>
//   a === b ||
//   (a &&
//     b &&
//     typeof a === 'object' &&
//     typeof b === 'object' &&
//     Object.keys({...a, ...b}).every((k) => deepEq(a[k], b[k])));

// export const pipe =
//   (...funcs) =>
//   (input) =>
//     funcs.reduce((r, f) => f(r), input);
