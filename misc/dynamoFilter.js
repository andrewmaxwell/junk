const {pipe, when, is, map, invertObj} = require('ramda');

const treeMap = func => data =>
  pipe(when(is(Object), map(treeMap(func))), func)(data);

const parse = (() => {
  const pathToAST = arr =>
    arr.length === 1
      ? {type: 'id', value: arr[0]}
      : {
          type: 'prop',
          children: [
            pathToAST(arr.slice(0, -1)),
            {type: 'id', value: arr[arr.length - 1]}
          ]
        };

  const funcs = {
    both: (a, b) => ({type: 'and', children: [a, b]}),
    either: (a, b) => ({type: 'or', children: [a, b]}),
    allPass: children => ({type: 'and', children}),
    anyPass: children => ({type: 'or', children}),
    complement: a => ({type: 'not', children: [a]}),
    propEq: (prop, value) => ({
      type: 'equals',
      children: [
        {type: 'id', value: prop},
        {type: 'value', value}
      ]
    }),
    pathEq: (path, value) => ({
      type: 'equals',
      children: [pathToAST(path), {type: 'value', value}]
    })
  };
  return filterFunc => filterFunc(funcs);
})();

const simplifyNot = (() => {
  const negations = {
    and: ({children}) => ({type: 'or', children: children.map(negate)}),
    or: ({children}) => ({type: 'and', children: children.map(negate)}),
    equals: ({children}) => ({type: 'notEqual', children}),
    notEqual: ({children}) => ({type: 'equals', children})
  };
  const defaultNegate = node => ({type: 'not', children: [node]});
  const negate = node => (negations[node.type] || defaultNegate)(node);
  return treeMap(node =>
    node.type === 'not' ? negate(node.children[0]) : node
  );
})();

const getFilterExpression = (() => {
  const stringifyFuncs = {
    and: ({children}) => children.map(toStr).join(' and '),
    or: ({children}) => children.map(toStr).join(' or '),
    not: ({children}) => `!(${toStr(children[0])})`,
    equals: ({children}) => children.map(toStr).join(' = '),
    notEqual: ({children}) => children.map(toStr).join(' <> '),
    id: ({value}) => value,
    value: ({value}) => JSON.stringify(value),
    prop: ({children}) => children.map(toStr).join('.')
  };
  const badNode = node => {
    throw new Error('BAD NODE: ' + JSON.stringify(node));
  };
  const toStr = node => (stringifyFuncs[node.type] || badNode)(node);
  return toStr;
})();

const dynamoFilter = filterFunc => {
  const namePlaceholders = {};
  let nameCounter = 97;

  const valuePlaceholders = {};
  let valueCounter = 97;

  const FilterExpression = pipe(
    parse,
    simplifyNot,
    treeMap(node => {
      if (node.type === 'id') {
        return {
          type: 'id',
          value: (namePlaceholders[node.value] =
            namePlaceholders[node.value] ||
            '#' + String.fromCharCode(nameCounter++))
        };
      }
      if (node.type === 'value') {
        return {
          type: 'id',
          value: (valuePlaceholders[node.value] =
            valuePlaceholders[node.value] ||
            ':' + String.fromCharCode(valueCounter++))
        };
      }
      return node;
    }),
    // tap(x => console.log(JSON.stringify(x, null, 2))),
    getFilterExpression
  )(filterFunc);

  return {
    FilterExpression,
    ExpressionAttributeValues: invertObj(valuePlaceholders),
    ExpressionAttributeNames: invertObj(namePlaceholders)
  };
};

const tests = [
  [
    ({both, complement, propEq, pathEq}) =>
      both(
        complement(propEq('currentStatus', 'outdated')),
        pathEq(['year', 'value'], '2020')
      ),
    {
      FilterExpression: '#a <> :a and #b.#c = :b',
      ExpressionAttributeValues: {':a': 'outdated', ':b': '2020'},
      ExpressionAttributeNames: {
        '#a': 'currentStatus',
        '#b': 'year',
        '#c': 'value'
      }
    }
  ],
  [
    ({allPass, complement, pathEq, propEq, either}) =>
      complement(
        allPass([
          pathEq(['year', 'value'], '2017'),
          propEq('currentStatus', 'draft'),
          either(
            pathEq(['id', 'value'], '123'),
            complement(pathEq(['something', 'value'], '456'))
          )
        ])
      ),
    {
      FilterExpression: '#a.#b <> :a or #c <> :b or #d.#b <> :c and #e.#b = :d',
      ExpressionAttributeValues: {
        ':a': '2017',
        ':b': 'draft',
        ':c': '123',
        ':d': '456'
      },
      ExpressionAttributeNames: {
        '#a': 'year',
        '#b': 'value',
        '#c': 'currentStatus',
        '#d': 'id',
        '#e': 'something'
      }
    }
  ]
];

const equals = (a, b) =>
  a && b && typeof a === 'object' && typeof b === 'object'
    ? Object.keys({...a, ...b}).every(key => equals(a[key], b[key]))
    : a === b;

tests.forEach(([arg, expected]) => {
  const actual = dynamoFilter(arg);
  if (equals(actual, expected)) console.log('PASS');
  else console.log('Expected', expected, 'got', actual);
});
