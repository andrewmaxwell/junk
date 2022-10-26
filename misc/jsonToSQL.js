const eachNode = (func, tree, dataPath = []) => {
  func(tree, dataPath);
  if (tree && typeof tree === 'object') {
    Object.entries(tree || {}).forEach(([key, val]) =>
      eachNode(func, val, [...dataPath, key])
    );
  }
};

const path = ([first, ...rest], data) =>
  first === undefined ? data : path(rest, (data || {})[first]);

const jsonToTables = (data) => {
  const res = {};
  eachNode((node, dataPath) => {
    if (!Array.isArray(node)) return;
    const tableName = dataPath.filter(isNaN).join('_');
    const parentId = path([...dataPath.slice(0, -1), 'id'], data);
    const parentName = tableName.slice(0, tableName.lastIndexOf('_')) + '_id';
    (res[tableName] = res[tableName] || []).push(
      ...(parentId ? node.map((r) => ({...r, [parentName]: parentId})) : node)
    );
  }, data);
  return res;
};

const getType = (val) =>
  typeof val === 'string' ? 'text' : typeof val === 'number' ? 'int' : '???';

const getColumns = (items) =>
  items
    .flatMap(Object.entries)
    .filter(([, v]) => !Array.isArray(v) && v !== null && v !== undefined)
    .filter((v, i, a) => i === a.findIndex((x) => x[0] === v[0]))
    .map(([name, val]) => ({name, type: getType(val)}));

const tableToSql = (name, items) => {
  const columns = getColumns(items);
  return [
    `CREATE TABLE ${name} (${columns
      .map((c) => c.name + ' ' + c.type)
      .join(', ')});`,
    `INSERT INTO ${name} (${columns
      .map((c) => c.name)
      .join(', ')}) VALUES ${items
      .map(
        (r) =>
          '(' + columns.map((c) => JSON.stringify(r[c.name])).join(', ') + ')'
      )
      .join(', ')};`,
  ];
};

const jsonToSQL = (data) =>
  Object.entries(jsonToTables(data)).flatMap(([name, items]) =>
    tableToSql(name, items)
  );

const input = {
  people: [
    {
      id: 218,
      name: 'Bob',
      age: 42,
      children: [
        {
          id: 384,
          name: 'Charles',
          age: 17,
          hobbies: [{id: 959, name: 'arson'}],
        },
        {
          id: 704342,
          name: 'Tina',
          age: 12,
          hobbies: [
            {id: 630, name: 'Instagram'},
            {id: 300, name: 'horse'},
          ],
        },
      ],
    },
    {
      id: 286,
      name: 'Bill',
      age: 37,
      children: [
        {
          id: 191,
          name: 'Bobby',
          age: 13,
          hobbies: [{id: 708, name: 'sportball'}],
        },
        {
          id: 519343,
          name: 'Jethro',
          age: 11,
          hobbies: [{id: 23, name: 'xbox'}],
        },
      ],
    },
  ],
};

import {Test} from './test.js';
Test.assertDeepEquals(jsonToSQL(input), [
  'CREATE TABLE people (id int, name text, age int);',
  'INSERT INTO people (id, name, age) VALUES (218, "Bob", 42), (286, "Bill", 37);',
  'CREATE TABLE people_children (id int, name text, age int, people_id int);',
  'INSERT INTO people_children (id, name, age, people_id) VALUES (384, "Charles", 17, 218), (704342, "Tina", 12, 218), (191, "Bobby", 13, 286), (519343, "Jethro", 11, 286);',
  'CREATE TABLE people_children_hobbies (id int, name text, people_children_id int);',
  'INSERT INTO people_children_hobbies (id, name, people_children_id) VALUES (959, "arson", 384), (630, "Instagram", 704342), (300, "horse", 704342), (708, "sportball", 191), (23, "xbox", 519343);',
]);
