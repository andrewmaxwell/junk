export const treeMap = (func, ob) => {
  const newTree = func(ob);
  if (!newTree || typeof newTree !== 'object') return newTree;
  const res = Array.isArray(newTree) ? [] : {};
  for (const key in newTree) res[key] = treeMap(func, newTree[key]);
  return res;
};

export const eachNode = (func, ob) => {
  func(ob);
  if (ob && typeof ob === 'object') {
    for (const key in ob) eachNode(func, ob[key]);
  }
};

// export const pipe =
//   (...funcs) =>
//   (input) =>
//     funcs.reduce((r, f) => f(r), input);
