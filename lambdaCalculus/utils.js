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
