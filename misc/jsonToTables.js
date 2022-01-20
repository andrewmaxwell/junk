const treeReduce = (func, initialVal, data, path = []) =>
  (data && typeof data === 'object' ? Object.keys(data) : []).reduce(
    (res, key) => treeReduce(func, res, data[key], [...path, key]),
    func(initialVal, data, path)
  );

const makeIdLookup = () => {
  const ids = {};
  return (type, strId) => {
    const t = (ids[type] = ids[type] || {_len: 0});
    return t[strId] || (t[strId] = ++t._len);
  };
};

const addToResult = (getId) => (result, node, path) => {
  if (!Array.isArray(node)) return result;
  const tableName = path[path.length - 1];
  if (!result[tableName]) result[tableName] = [];

  const ancestors = {};
  const ids = [];
  for (let i = 0; i < path.length - 1; i += 2) {
    ids.push(path[i + 1]);
    ancestors[path[i] + '_id'] = getId(path[i], ids);
  }

  for (const [id, data] of Object.entries(node)) {
    const row = {
      [tableName + '_id']: getId(tableName, [...ids, id]),
      ...ancestors,
    };
    for (const key in data) {
      if (!Array.isArray(data[key])) row[key] = data[key];
    }
    result[tableName].push(row);
  }
  return result;
};

const jsonToTables = (data) =>
  treeReduce(addToResult(makeIdLookup()), {}, data);

import {Test} from './test.js';
Test.assertDeepEquals(
  jsonToTables({
    person: [
      {
        name: 'Bob',
        age: 50,
        hobby: [{name: 'smoking', stuff: [{val: 5}]}, {name: 'chewing'}],
      },
      {
        name: 'Bill',
        age: 30,
        hobby: [{name: 'eating'}, {name: 'sleeping', stuff: [{val: 6}]}],
      },
      {name: 'Brad', age: 60, hobby: []},
    ],
  }),
  {
    person: [
      {person_id: 1, name: 'Bob', age: 50},
      {person_id: 2, name: 'Bill', age: 30},
      {person_id: 3, name: 'Brad', age: 60},
    ],
    hobby: [
      {hobby_id: 1, person_id: 1, name: 'smoking'},
      {hobby_id: 2, person_id: 1, name: 'chewing'},
      {hobby_id: 3, person_id: 2, name: 'eating'},
      {hobby_id: 4, person_id: 2, name: 'sleeping'},
    ],
    stuff: [
      {stuff_id: 1, person_id: 1, hobby_id: 1, val: 5},
      {stuff_id: 2, person_id: 2, hobby_id: 4, val: 6},
    ],
  }
);
