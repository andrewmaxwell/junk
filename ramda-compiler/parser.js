import {treeMap} from './utils.js';
const {
  pipe,
  reject,
  propEq,
  path,
  assoc,
  prop,
  when,
  ifElse,
  always,
  over,
  concat,
  last,
  init,
  is,
  reduce,
  append,
  __,
  lensPath,
  isEmpty,
  prepend,
  slice,
  head
} = window.R;

const tokenTypes = [
  {type: 'comment', regex: /^\/\/(.+)/},
  {type: 'space', regex: /^\s+/},
  {type: 'id', regex: /^[a-z]\w*/gi},
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

export const parse = pipe(
  tokenize,
  reject(propEq('type', 'space')),
  nest('(', ')'),
  nest('[', ']'),
  makeArrays,
  makeFunctions,
  ifElse(c => c.length > 1, children => ({type: 'program', children}), head)
);
