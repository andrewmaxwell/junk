'use strict';
console.clear();

import {toJS} from './toJS.js';

const {
  pipe,
  reject,
  propEq,
  path,
  assoc,
  head,
  map,
  prop,
  when,
  both,
  ifElse,
  always,
  over,
  concat,
  last,
  init,
  identity,
  is,
  curry,
  pathEq,
  reduce,
  equals,
  append,
  length,
  __,
  converge,
  call,
  defaultTo,
  of,
  lensPath,
  isEmpty,
  prepend,
  slice,
  allPass,
  eqBy,
  toPairs,
  filter,
  pluck,
  keys,
  join,
  propSatisfies,
  drop
} = window.R;

const tokenTypes = [
  {type: 'space', regex: /^\s+/},
  {type: 'id', regex: /^[a-z]\w*/g},
  {type: 'string', regex: /^'([^']*)'/},
  {type: 'number', regex: /^(\d+)/},
  {type: '(', regex: /^\(/},
  {type: ')', regex: /^\)/},
  {type: '[', regex: /^\[/},
  {type: ']', regex: /^\]/},
  {type: ',', regex: /^,/}
];

const tokenize = ifElse(isEmpty, always([]), str => {
  var {type, regex} = tokenTypes.find(t => t.regex.test(str)) || {};
  if (!type) throw new Error(`No matching token for "${str}"`);
  var m = str.match(regex);
  return pipe(
    slice(m[0].length, Infinity),
    tokenize,
    prepend({type, value: m[1] || m[0]})
  )(str);
});

const treeMap = curry((func, data) =>
  when(is(Object), map(treeMap(func)), func(data))
);

const nest = (start, end) =>
  treeMap(
    when(
      is(Array),
      pipe(
        reduce(
          ({r, p}, el) => {
            if (el.type === start && !el.children) {
              return {
                r: over(lensPath(p), append(assoc('children', [], el)), r),
                p: concat(p, [path(p, r).length, 'children'])
              };
            } else if (el.type === end) return {r, p: p.slice(0, -2)};
            else return {r: over(lensPath(p), append(el), r), p};
          },
          {r: [], p: []}
        ),
        prop('r')
      )
    )
  );

const makeFunctions = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length && el.type === '(' && last(res).type === 'id'
          ? init(res).concat({
              type: 'functionCall',
              func: last(res),
              children: pipe(
                prop('children'),
                reject(propEq('type', ','))
              )(el)
            })
          : res.concat(el),
      []
    )
  )
);

const makeArrays = treeMap(
  when(
    propEq('type', '['),
    pipe(
      prop('children'),
      reject(propEq('type', ',')),
      assoc('children', __, {type: 'array'})
    )
  )
);

const unpipe = treeMap(
  when(
    both(propEq('type', 'functionCall'), pathEq(['func', 'value'], 'pipe')),
    el => ({
      type: 'functionDef',
      args: ['p'],
      children: [
        el.children.reduce(
          (res, el) =>
            el.children
              ? assoc(
                  'children',
                  el.children.filter(c => c.type !== ',').concat(res),
                  el
                )
              : {type: 'functionCall', func: el, children: [res]},
          {type: 'id', value: 'p'}
        )
      ]
    })
  )
);

const unreject = treeMap(
  when(pathEq(['func', 'value'], 'reject'), ({children: [func, parent]}) => ({
    type: 'functionCall',
    func: {type: 'property', parent, value: 'filter'},
    children: [
      {
        type: 'functionDef',
        args: ['r'],
        children: [
          {
            type: '!',
            children: [
              {
                type: 'functionCall',
                func,
                children: [{type: 'id', value: 'r'}]
              }
            ]
          }
        ]
      }
    ]
  }))
);

const unfilter = treeMap(
  when(
    propEq('func', {type: 'id', value: 'filter'}),
    ({children: [func, parent]}) => ({
      type: 'functionCall',
      func: {type: 'property', parent, value: 'filter'},
      children: [func]
    })
  )
);

const unmap = treeMap(
  when(
    propEq('func', {type: 'id', value: 'map'}),
    ({children: [func, parent]}) => ({
      type: 'functionCall',
      func: {type: 'property', parent, value: 'map'},
      children: [func]
    })
  )
);

const unpluck = treeMap(
  when(pathEq(['func', 'value'], 'pluck'), ({children: [{value}, parent]}) => ({
    type: 'functionCall',
    func: {type: 'property', parent, value: 'map'},
    children: [
      {
        type: 'functionDef',
        args: ['u'],
        children: [{type: 'property', parent: {type: 'id', value: 'u'}, value}]
      }
    ]
  }))
);

const unpather = el =>
  el.children[0].children.reduce(
    (res, {value}) => ({
      type: 'property',
      parent: {
        type: '||',
        children: [res, {type: 'object', children: []}]
      },
      value
    }),
    el.children[1] || {type: 'id', value: 'a'}
  );

const unpath = treeMap(
  when(
    pathEq(['func', 'value'], 'path'),
    ifElse(
      pipe(
        prop('children'),
        length,
        equals(2)
      ),
      unpather,
      el => ({type: 'functionDef', args: ['a'], children: [unpather(el)]})
    )
  )
);

const unIsNil = treeMap(
  when(pathEq(['func', 'value'], 'isNil'), el => ({
    type: '||',
    children: [
      {
        type: '===',
        children: [el.children[0], {type: 'id', value: 'null'}]
      },
      {
        type: '===',
        children: [el.children[0], {type: 'id', value: 'undefined'}]
      }
    ]
  }))
);

const ununnest = treeMap(
  when(pathEq(['func', 'value'], 'unnest'), ({children: [parent]}) => ({
    type: 'functionCall',
    func: {type: 'property', parent, value: 'reduce'},
    children: [
      {
        type: 'functionDef',
        args: ['res', 'el'],
        children: [
          {
            type: 'functionCall',
            func: {
              type: 'property',
              parent: {type: 'id', value: 'res'},
              value: 'concat'
            },
            children: [{type: 'id', value: 'el'}]
          }
        ]
      },
      {type: 'array', children: []}
    ]
  }))
);

const [uninc, undec] = [['inc', '+'], ['dec', '-']].map(([id, op]) =>
  treeMap(
    when(
      equals({type: 'id', value: id}),
      always({
        type: 'functionDef',
        args: ['x'],
        children: [
          {
            type: op,
            children: [{type: 'id', value: 'x'}, {type: 'number', value: '1'}]
          }
        ]
      })
    )
  )
);

const mathOps = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  modulo: '%'
};
const unMathOp = treeMap(
  when(
    both(propEq('type', 'id'), propSatisfies(prop(__, mathOps), 'value')),
    ({value}) => ({
      type: 'functionDef',
      args: ['a', 'b'],
      children: [
        {
          type: mathOps[value],
          children: [{type: 'id', value: 'a'}, {type: 'id', value: 'b'}]
        }
      ]
    })
  )
);

const unconverge = treeMap(
  when(
    pathEq(['func', 'value'], 'converge'),
    ({children: [func, arr, data]}) => {
      const def = {
        type: 'functionDef',
        args: ['v'],
        children: [
          {
            type: 'functionCall',
            func,
            children: arr.children.map(func => ({
              type: 'functionCall',
              func,
              children: [{type: 'id', value: 'v'}]
            }))
          }
        ]
      };
      return data ? {type: 'functionCall', func: def, children: [data]} : def;
    }
  )
);

const negate = converge(call, [
  pipe(
    prop('type'),
    prop(__, {
      '!': path(['children', 0]),
      '||': el => ({type: '&&', children: el.children.map(negate)}),
      '&&': el => ({type: '||', children: el.children.map(negate)}),
      '===': assoc('type', '!=='),
      '!==': assoc('type', '===')
    }),
    defaultTo(
      pipe(
        of,
        assoc('children', __, {type: '!'})
      )
    )
  ),
  identity
]);

const simplifyNot = treeMap(
  when(
    propEq('type', '!'),
    pipe(
      path(['children', 0]),
      negate
    )
  )
);

const treeReplace = (from, to, data) =>
  treeMap(when(equals(from), always(to)), data);

const treeMap2 = curry((func, data) =>
  pipe(
    when(is(Object), map(treeMap2(func))),
    func
  )(data)
);

const simplifyIIFE = treeMap2(
  when(
    allPass([
      propEq('type', 'functionCall'),
      pathEq(['func', 'type'], 'functionDef')
      // converge(eqBy(length), [prop('children'), path(['func', 'args'])])
    ]),
    ({func, children}) => {
      if (children.length >= func.args.length) {
        return func.args.reduce(
          (res, value, i) =>
            treeReplace({type: 'id', value}, simplifyIIFE(children[i]), res),
          func.children[0]
        );
      } else {
        return {
          type: 'functionDef',
          args: drop(children.length, func.args),
          children: [
            children.reduce(
              (res, value, i) =>
                treeReplace(
                  {type: 'id', value: func.args[i]},
                  simplifyIIFE(value),
                  res
                ),
              func.children[0]
            )
          ]
        };
      }
    }
  )
);

const transforms = {
  unpipe,
  unmap,
  unreject,
  unfilter,
  unpath,
  unIsNil,
  ununnest,
  unpluck,
  uninc,
  undec,
  unMathOp,
  unconverge,
  simplifyIIFE,
  // simplifyIIFE2: simplifyIIFE,
  simplifyNot
};

const toAST = (activeTransforms, str) =>
  pipe(
    tokenize,
    reject(propEq('type', 'space')),
    nest('(', ')'),
    nest('[', ']'),
    makeArrays,
    makeFunctions,
    head, // todo?
    ...activeTransforms
  )(str);

const input = document.querySelector('textarea');
// input.value = `pipe(
//   filter(path(['entitlements', 'PGM_SPECIALIST'])),
//   pluck('_id')
// )`;
// input.value = `converge(add, [inc, add(5)])`;
// input.value = `when(gt(10), subtract(5))`;
if (localStorage.ramdaInput) input.value = localStorage.ramdaInput;

window.compile = input.onkeyup = () => {
  localStorage.ramdaInput = input.value;
  const activeTransforms = pipe(
    toPairs,
    filter(p => document.querySelector('#' + p[0]).checked),
    pluck(1)
  )(transforms);
  const res = toAST(activeTransforms, input.value);
  console.log(res);
  document.querySelector('pre').innerHTML =
    toJS(res) + '\n\n' + JSON.stringify(res, null, 2);
};

document.querySelector('#opts').innerHTML = pipe(
  keys,
  map(
    key =>
      `<label>
        <input type="checkbox" id="${key}" onClick="compile()" checked/> ${key}
      </label>`
  ),
  join('<br/>')
)(transforms);

window.compile();
input.focus();

// w => gt(10, w) ? ((a, b) => a - b)(5)(w) : w
