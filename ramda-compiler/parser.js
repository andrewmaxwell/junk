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
  over,
  concat,
  last,
  init,
  is,
  reduce,
  append,
  __,
  lensPath,
  slice,
  head,
  allPass,
  pathEq,
  length,
  nth,
  both,
  contains,
  equals,
  lensIndex
} = window.R;

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

const parseFunctionCalls = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length &&
        el.type === 'argList' &&
        ['id', 'property'].includes(last(res).type)
          ? init(res).concat({
              type: 'functionCall',
              func: last(res),
              children: el.children
            })
          : res.concat(el),
      []
    )
  )
);

const parseList = (tokenType, type) =>
  treeMap(
    when(
      propEq('type', tokenType),
      pipe(
        prop('children'),
        reject(propEq('type', ',')),
        assoc('children', __, {type})
      )
    )
  );

const parseProperties = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length > 1 && last(res).type === '.'
          ? slice(0, -2, res).concat({
              type: 'property',
              parent: nth(-2, res),
              value: el.value
            })
          : res.concat(el),
      []
    )
  )
);

const parseIndexes = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length && el.type === 'array' && last(res).type === 'id'
          ? init(res).concat({
              type: 'property',
              parent: last(res),
              value: el.children[0]
            })
          : res.concat(el),
      []
    )
  )
);

const parseFunctionDefs = treeMap(
  when(
    allPass([is(Array), length, pathEq([1, 'type'], '=>')]),
    ([args, , ...children]) => [
      {
        type: 'functionDef',
        args: args.children ? args.children.map(o => o.value) : [args.value],
        children
      }
    ]
  )
);

const parseNot = treeMap(
  when(
    both(is(Array), contains({type: '!', value: '!'})),
    reduce(
      (res, el) =>
        res.length && last(res).type === '!'
          ? init(res).concat({type: '!', children: [el]})
          : res.concat(el),
      []
    )
  )
);

const parseInfix = type =>
  treeMap(
    when(
      both(is(Array), contains({type, value: type})),
      pipe(
        reduce(
          (res, el) =>
            equals(el, {type, value: type})
              ? append([], res)
              : over(lensIndex(res.length - 1), append(el), res),
          [[]]
        ),
        children => [{type, children}]
      )
    )
  );

export const parse = pipe(
  reject(propEq('type', 'space')),
  nest('(', ')'),
  nest('[', ']'),
  nest('{', '}'),
  parseProperties,
  parseIndexes,
  parseList('[', 'array'),
  parseList('(', 'argList'),
  parseFunctionCalls,
  parseFunctionDefs,
  parseNot,
  parseInfix('||'),
  parseInfix('==='),
  parseInfix('+'),
  ifElse(c => c.length > 1, children => ({type: 'program', children}), head)
);
