'use strict';
const {
  toPairs,
  ifElse,
  isEmpty,
  always,
  pipe,
  slice,
  prepend,
  curry,
  when,
  is,
  map,
  reduce,
  over,
  lensPath,
  append,
  assoc,
  concat,
  path,
  prop,
  propEq,
  evolve,
  replace,
  lensProp,
  contains,
  reject,
  __,
  findIndex,
  pluck,
  head,
  identity,
  lensIndex,
  last,
  init,
  both,
  any,
  splitEvery
} = window.R;

const tokenRegexes = toPairs({
  space: /^\s+/,
  comment: /\/\/.*/,
  number: /^(\d+)/,
  id: /^([^ (){}[\]<>'":%,]+)/,
  string: /^"([^"]*)"/,
  '%%': /^%%/,
  '%&': /^%&/,
  '%n': /^%([^ (){}[\]<>'":%,]+)/,
  '%': /^%/,
  '(': /^\(/,
  ')': /^\)/,
  '[': /^\[/,
  ']': /^\]/,
  '{': /^{/,
  '}': /^}/,
  '<': /^</,
  '>': /^>/,
  ',': /^,/,
  ':': /^:/
});

const tokenize = ifElse(isEmpty, always([]), str => {
  var [type, regex] = tokenRegexes.find(t => t[1].test(str)) || [];
  if (!type) throw new Error(`No matching token for "${str}"`);
  var [full, partial] = str.match(regex);
  return pipe(
    slice(full.length, Infinity),
    tokenize,
    prepend({type, value: partial || full})
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
          ({r, p}, el) =>
            el.type === start && !el.children
              ? {
                  r: over(lensPath(p), append(assoc('children', [], el)), r),
                  p: concat(p, [path(p, r).length, 'children'])
                }
              : el.type === end
              ? {r, p: p.slice(0, -2)}
              : {r: over(lensPath(p), append(el), r), p},
          {r: [], p: []}
        ),
        prop('r')
      )
    )
  );

const sanitizeNames = treeMap(
  when(propEq('type', 'id'), evolve({value: replace(/[^a-z0-9_$]/g, '')}))
);

const makeArrays = treeMap(
  when(
    propEq('type', '['),
    pipe(
      prop('children'),
      reject(propEq('type', ',')),
      children => ({type: 'array', children})
    )
  )
);

const shortHandFunc = treeMap(
  when(
    propEq('type', '<'),
    pipe(
      assoc('type', '('),
      over(lensProp('children'), prepend({type: 'id', value: 'fn'}))
    )
  )
);

const functions = treeMap(
  when(
    pipe(
      prop('type'),
      contains(__, ['(', '{'])
    ),
    ({type, children: [func, ...children]}) => ({
      type: type === '{' ? 'greedyFunctionCall' : 'functionCall',
      func,
      children
    })
  )
);

const greedyFunctions = treeMap(
  when(both(is(Array), any(propEq('type', 'greedyFunctionCall'))), arr => {
    const index = findIndex(propEq('type', 'greedyFunctionCall'), arr);
    const {func, children} = arr[index];
    return arr.slice(0, index).concat({
      type: 'functionCall',
      func,
      children: children.concat(arr.slice(index + 1))
    });
  })
);

const iife = children => ({
  type: 'functionCall',
  children: [],
  func: {
    type: '(',
    children: [
      {
        type: 'functionDef',
        args: [],
        children
      }
    ]
  }
});

const arithmetic = type => children =>
  children.length > 1
    ? {type, children}
    : {
        type: 'functionDef',
        args: ['n'],
        children: [
          {
            type,
            children: children.concat({type: 'id', value: 'n'})
          }
        ]
      };

var transforms = {
  let: ([name, children, ...rest]) =>
    iife([{type: 'declaration', name, children}, ...rest]),
  lets: ([arr, ...rest]) =>
    iife(
      splitEvery(3, arr.children)
        .map(([name, , children]) => ({
          type: 'declaration',
          name,
          children
        }))
        .concat(rest)
    ),
  fn: ([args, ...children]) => ({
    type: 'functionDef',
    args: pluck('value', args.children),
    children
  }),
  do: iife,
  println: children => ({
    type: 'functionCall',
    func: {
      type: 'property',
      parent: {type: 'id', value: 'console'},
      value: 'log'
    },
    children
  }),
  if: ([a, b, cond]) => ({
    type: 'ternary',
    children: [cond, a, b]
  }),
  lt: arithmetic('<'),
  lte: arithmetic('<='),
  gt: arithmetic('>'),
  gte: arithmetic('>='),
  '+': arithmetic('+'),
  '-': arithmetic('-'),
  '*': arithmetic('*'),
  '/': arithmetic('/')
};

const transformFunctions = treeMap(
  when(propEq('type', 'functionCall'), el =>
    transforms[el.func.value] ? transforms[el.func.value](el.children) : el
  )
);

const wrapIife = ifElse(propEq('length', 1), head, iife);

const specialArgs = {
  '%n': ({value}) => ({
    type: 'property',
    parent: {type: 'id', value: 'arguments'},
    value
  }),
  '%': () => ({
    type: 'id',
    value: '[...arguments]'
  }),
  '%%': () => ({
    type: 'array',
    children: [
      {
        type: 'id',
        value: 'self'
      },
      {
        type: 'rest',
        value: {
          type: 'id',
          value: 'arguments'
        }
      }
    ]
  }),
  '%&': () => ({
    type: 'id',
    value: '[...arguments].slice(arguments.callee.length)'
  })
};

const replaceArgs = treeMap(t => (specialArgs[t.type] || identity)(t));

const makeLabels = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length && el.type === ':'
          ? append({type: 'label', value: last(res).value}, init(res))
          : append(el, res),
      []
    )
  )
);

const returnLast = treeMap(
  when(
    propEq('type', 'functionDef'),
    over(lensProp('children'), children =>
      over(
        lensIndex(children.length - 1),
        children => ({type: 'return', children: [children]}),
        children
      )
    )
  )
);

export const toAST = pipe(
  tokenize,
  reject(propEq('type', 'space')),
  nest('{', '}'),
  nest('(', ')'),
  nest('[', ']'),
  nest('<', '>'),
  makeArrays,
  shortHandFunc,
  functions,
  greedyFunctions,
  transformFunctions,
  makeLabels,
  replaceArgs,
  wrapIife,
  returnLast,
  sanitizeNames
);
