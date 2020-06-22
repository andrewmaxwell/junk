// supports plain objects, arrays, and primitives only. Like JSON.
// Does not support dates, regexes, Sets, Maps, etc...

const getType = (x) => Object.prototype.toString.call(x).slice(8, -1);

const calcDiff = (lhs, rhs, path = []) => {
  if (lhs === rhs) return [];
  const t = getType(lhs);
  if (t === getType(rhs) && (t === 'Object' || t === 'Array')) {
    return Object.keys({...lhs, ...rhs}).flatMap((key) =>
      calcDiff(lhs[key], rhs[key], [...path, key])
    );
  }
  return [{path, lhs, rhs}];
};

// const assocPath = ([first, ...rest], val, data) => {
//   if (first === undefined) return val;
//   const copy = Array.isArray(data) ? [...data] : {...data};
//   copy[first] = assocPath(rest, val, data[first]);
//   return copy;
// };

// const applyDiff = (data, diff) =>
//   diff.reduce((res, {path, rhs}) => assocPath(path, rhs, res), data);

const data = {
  name: 'Bob',
  age: 41,
  lastName: 'Bobson',
  middleName: 'T',
  hobbies: ['fishing', 'kicking', 'sleeping'],
  numbers: [3, 4, 5, 6],
  family: [
    {relationship: 'mother', name: 'Mary'},
    {relationship: 'father', name: 'Tom'},
    {relationship: 'brother', name: 'Jethro'},
  ],
  x: {0: 'a', 1: 'b'},
  sameArr: [5, 6, 7],
  sameOb: {stuff: 'things', deep: [{a: [{b: 'x'}]}]},
  d: new Date('June 30, 1988'),
  j: null,
};

const modified = {
  name: 'Bobert',
  lastName: 'Bobson',
  age: 42,
  hobbies: ['fishing', 'kicking', 'sleeping', 'eating'],
  numbers: [4, 5, 6],
  family: [
    {relationship: 'father', name: 'Reginald'},
    {relationship: 'brother', name: 'Jethro'},
  ],
  x: ['a', 'b'],
  sameArr: [5, 6, 7],
  sameOb: {stuff: 'things', deep: [{a: [{b: 'x'}]}]},
  d: new Date('June 30, 1988'),
};

const diff = calcDiff(data, modified);
// const applied = applyDiff(data, diff);
// const result = calcDiff(applied, modified);
console.log(diff);
