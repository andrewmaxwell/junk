const diff = (lhs, rhs, path = []) => {
  if (lhs === rhs) return [];
  if (lhs && rhs && typeof lhs === 'object' && typeof rhs === 'object') {
    return Object.keys({...lhs, ...rhs}).flatMap((key) =>
      diff(lhs[key], rhs[key], [...path, key])
    );
  }
  return [{path, lhs, rhs}];
};

const {deepStrictEqual} = require('assert').strict;

const res1 = diff({a: null, b: 5}, {a: {}, b: 5});
deepStrictEqual(, [
  {path: ['a'], lhs: null, rhs: {}},
]);
