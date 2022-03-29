export const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === '(') indexes.push(result.length);
    else if (t === ')') {
      if (!indexes.length) throw new Error('Unexpected )');
      result.push(result.splice(indexes.pop()));
    } else result.push(t);
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

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
