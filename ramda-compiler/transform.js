import {treeMap} from './utils.js';
import {parse} from './parser.js';

/*

pipe(
  filter(path(['entitlements', 'PGM_SPECIALIST'])),
  pluck('_id')
)
converge(add, [inc, add(5)])
when(gt(10), subtract(5))

*/

const ramdaFuncs = map(parse, {
  add: '(a, b) => a + b',
  // addIndex
  // adjust
  all: '(f, d) => d.every(f)',
  allPass: '(a, d) => a.every(f => f(d))',
  always: '(a, d) => a',
  and: '(a, b) => a && b',
  any: '(f, d) => d.some(f)',
  anyPass: '(a, d) => a.some(f => f(d))',
  append: '(e, a) => a.concat(e)',
  apply: '(a, f) => f(...a)',
  applyTo: '(v, f) => f(v)',
  // ascend
  assoc: '(k, v, d) => ({...d, [k]: v})',
  both: '(f, g, d) => f(d) && g(d)',
  call: '(f, v) => f(v)',
  chain: '(f, d) => d.flatMap(f)',
  clamp: '(a, b, n) => Math.max(a, Math.min(b, n))',
  // clone
  // comparator
  complement: '(f, d) => !f(d)',
  // compose
  // composeWith
  concat: '(a, b) => a.concat(b)',
  // cond
  // countBy
  // curry
  dec: 'x => x - 1',
  defaultTo: '(d, v) => v === null || v === undefined ? d : v',
  // descend
  // difference: ('(a, b) => [...new Set(a)].filter(v => !b.includes(v))'),
  // differenceWith: ('(f, a, b) => [...new Set(a.map(f))].filter(v => !b.includes(f(v))'),
  // dissoc
  // dissocPath
  divide: '(a, b) => a / b',
  drop: '(n, a) => a.slice(n)',
  dropLast: '(n, a) => a.slice(0, -n)',
  // dropLastWhile
  // dropRepeats
  // dropRepeatsWith
  // dropWhile
  either: '(f, g, d) => f(d) || g(d)',
  // empty
  // endsWith
  // eqBy
  // eqProps
  equals: `(a, b) => a === b`, // not quite accurate
  // evolve
  F: '() => false',
  filter: '(f, d) => d.filter(f)',
  find: '(f, d) => f.find(f)',
  findIndex: '(f, d) => f.findIndex(f)',
  // findLast
  // findLastIndex
  // flatten
  // flip
  forEach: '(f, d) => d.forEach(f)', // not quite accurate, shouldn't skip empty
  forEachObjIndexed: '(f, d) => d.forEach(f)',
  // fromPairs
  // groupBy
  // groupWith
  gt: '(a, b) => a > b',
  gte: '(a, b) => a >= b',
  has: '(p, o) => o.hasOwnProperty(p)',
  // hasPath
  head: 'a => a[0]',
  identical: '(a, b) => a === b',
  identity: 'a => a',
  ifElse: '(p, t, e, d) => p(d) ? t(d) : e(d)',
  inc: 'x => x + 1',
  includes: '(v, d) => d.includes(v)', // should be by equal
  indexBy: '(p, a) => a.reduce((r, v) => ({...r, [p(v)]: v}), {})',
  indexOf: '(v, a) => a.indexOf(v)',
  init: 'a => a.slice(0, -1)',
  // innerJoin
  // insert
  // insertAll
  // intersection
  // intersperse
  // into
  // invert
  // invertObj
  // invoker
  is: '(t, d) => d != null && d.constructor == t',
  isEmpty: 'a => !Object.keys(a).length',
  isNil: 'n => n === null || n === undefined',
  join: '(j, d) => d.join(j)',
  // juxt
  keys: 'Object.keys',
  // keysIn
  last: 'a => a[a.length - 1]',
  // lastIndexOf
  length: 'a => a.length',
  // lens
  // lensIndex
  // lensPath
  // lensProp
  // lift
  lt: '(a, b) => a < b',
  lte: '(a, b) => a <= b',
  map: '(f, d) => d.map(f)',
  // mapAccum
  // mapAccumRight
  // mapObjIndexed
  match: '(r, s) => s.match(r)',
  mathMod: '(m, p) => ((m % p) + p) % p',
  max: 'Math.max',
  maxBy: '(f, a, b) => f(a) > f(b) ? a : b',
  // mean
  // median
  // memoizeWith
  // mergeAll
  // mergeDeepLeft
  // mergeDeepRight
  // mergeDeepWith
  // mergeDeepWithKey
  mergeLeft: '(a, b) => Object.assign({}, a, b)',
  mergeRight: '(a, b) => Object.assign({}, b, a)',
  // mergeWith
  // mergeWithKey
  min: 'Math.min',
  minBy: '(f, a, b) => f(a) < f(b) ? a : b',
  modulo: '(a, b) => a % b',
  // move
  multiply: '(a, b) => a * b',
  // negate: ('a => -a'), // doesn't support unary - or negative numbers yet
  none: '(f, d) => d.every(v => !f(v))',
  not: 'n => !n',
  nth: '(i, d) => d[i < 0 ? d.length + i : i]',
  // nthArg
  // objOf: ('(p, v) => ({[p]: v})'),
  of: 'v => [v]',
  // omit
  // once
  or: '(a, b) => a || b',
  // over
  pair: '(a, b) => [a, b]',
  // pathEq
  // pathOr
  // pathSatisfies
  // pick
  // pickAll
  // pickBy
  // pipeWith
  pluck: '(p, d) => d.map(u => u[p])',
  prepend: '(v, d) => [v].concat(d)',
  product: 'a => a.reduce((r, x) => r * x, 1)',
  // project: '(a, d) => d.map(props(a))',
  prop: '(k, d) => d[k]',
  propEq: '(k, v, d) => equals(d[k], v)',
  propIs: '(t, p, d) => d[p] != null && d[p].constructor == t',
  propOr: '(e, p, d) => d[p] === undefined ? e : d[p]',
  props: '(a, d) => a.map(v => d[v])',
  propSatisfies: '(f, p, d) => f(d[p])',
  // range: '(f, t) => Array(t - f).fill().map((v, i) => f + i)',
  reduce: '(f, a, d) => d.reduce(f, a)',
  // reduceBy
  // reduced
  // reduceRight
  // reduceWhile
  reject: '(f, d) => d.filter(v => !f(v))',
  // remove
  // repeat: '(e, n) => Array(n).fill(e)',
  // replace
  // reverse: 'a => a.slice().reverse()',
  // scan
  // sequence
  // set
  slice: '(n, m, a) => a.slice(n, m)',
  // sort: '(c, a) => a.slice().sort(c)',
  // sortBy
  // sortWith
  split: '(s, d) => d.split(s)',
  // splitAt
  // splitEvery
  // splitWhen
  startsWith: '(s, d) => d.startsWith(s)',
  subtract: '(a, b) => a - b',
  sum: 'd => d.reduce((a, b) => a + b, 0)',
  // symmetricDifference
  // symmetricDifferenceWith
  T: '() => true',
  tail: 'a => a.slice(1)',
  take: '(n, a) => a.slice(0, n)',
  takeLast: '(n, a) => a.slice(-n)',
  // takeLastWhile
  // takeWhile
  // tap
  // test
  then: '(f, p) => p.then(f)',
  // thunkify
  // times
  toLower: 's => s.toLowerCase()',
  toPairs: 'Object.entries',
  // toPairsIn
  // toString
  toUpper: 's => s.toUpperCase()',
  // transduce
  // transpose
  // traverse
  trim: 's => s.trim()',
  // tryCatch
  // type
  // unapply
  // unary
  // uncurryN
  // unfold
  // union
  // unionWith
  // uniq
  // uniqBy
  // uniqWith
  unless: '(p, f, w) => p(w) ? w : f(w)',
  unnest: 'a => a.flat()',
  // until
  // update
  // useWith
  values: 'Object.values',
  // valuesIn
  // view
  when: '(p, f, w) => p(w) ? f(w) : w'
  // where
  // whereEq
  // without
  // xprod
  // zip
  // zipObj
  // zipWith
});

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

const unassocPather = (arr, val, parent) =>
  arr.length
    ? {
        type: 'object',
        children: [
          {type: 'spread', value: parent},
          {
            type: 'pair',
            key: arr[0],
            value: unassocPather(arr.slice(1), val, {
              type: 'property',
              parent,
              value: arr[0]
            })
          }
        ]
      }
    : val;

// assocPath(a, v) ->  u => {...u, a0: {...u.a0, a1: {...u.a0.a1, a2: v}}}
const unassocPath = treeMap(
  when(pathEq(['func', 'value'], 'assocPath'), ({children: [arr, val]}) => ({
    type: 'functionDef',
    args: ['u'],
    children: [unassocPather(arr.children, val, {type: 'id', value: 'u'})]
  }))
);

const unpather = el =>
  el.children[0].children.reduce(
    (res, value) => ({
      type: 'property',
      parent: {
        type: '||',
        children: [res, {type: 'object', children: []}]
      },
      value
    }),
    el.children[1] || {type: 'id', value: 'a'}
  );

// (a, d) => ((d || {}).a0 || {}).a1 ...
const unpath = treeMap(
  when(pathEq(['func', 'value'], 'path'), el => ({
    type: 'functionDef',
    args: ['a'],
    children: [unpather(el)]
  }))
);

// (con, arr, data) => con(arr[0](data), ...)
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
      '==': assoc('type', '!='),
      '!=': assoc('type', '=='),
      '===': assoc('type', '!=='),
      '!==': assoc('type', '==='),
      '>': assoc('type', '<='),
      '>=': assoc('type', '<'),
      '<': assoc('type', '>='),
      '<=': assoc('type', '>')
    }),
    defaultTo(pipe(of, assoc('children', __, {type: '!'})))
  ),
  identity
]);

const simplifyNot = treeMap(
  when(propEq('type', '!'), pipe(path(['children', 0]), negate))
);

const treeReplace = (from, to, data) =>
  treeMap(when(equals(from), always(to)))(data);

const simplifyIIFE = treeMap(
  when(
    allPass([
      propEq('type', 'functionCall'),
      pathEq(['func', 'type'], 'functionDef')
    ]),
    pipe(
      ({func, children}) =>
        simplifyIIFE({
          type: 'functionDef',
          args: func.args.filter(
            (arg, i) => !children[i] || children[i].value === '__'
          ),
          children: [
            children.reduce(
              (res, value, i) =>
                propEq('value', '__', value)
                  ? res
                  : treeReplace({type: 'id', value: func.args[i]}, value, res),
              func.children[0]
            )
          ]
        }),
      when(propSatisfies(isEmpty, 'args'), path(['children', 0]))
    )
  )
);

const transforms = {
  unpipe,
  unpath,
  unassocPath,
  unconverge,
  unramda: treeMap(
    when(
      both(propEq('type', 'id'), n => ramdaFuncs[n.value]),
      n => ramdaFuncs[n.value]
    )
  ),
  simplifyIIFE,
  simplifyNot
};

export const transform = pipe(...values(transforms));
