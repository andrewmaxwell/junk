'use strict';
console.clear();

import {treeMap} from './utils.js';

const {
  pipe,
  propEq,
  path,
  assoc,
  map,
  prop,
  when,
  both,
  ifElse,
  always,
  identity,
  pathEq,
  equals,
  length,
  __,
  converge,
  call,
  defaultTo,
  of,
  isEmpty,
  allPass,
  propSatisfies,
  drop,
  values
} = window.R;

/*

pipe(
  filter(path(['entitlements', 'PGM_SPECIALIST'])),
  pluck('_id')
)
converge(add, [inc, add(5)])
when(gt(10), subtract(5))

*/

// const treeMap = curry((func, data) =>
//   when(is(Object), map(treeMap(func)), func(data))
// );

const ramdaFuncs = {
  // (k, d) => d[k]
  prop: {
    type: 'functionDef',
    args: ['k', 'd'],
    children: [
      {
        type: 'property',
        parent: {type: 'id', value: 'd'},
        value: {type: 'id', value: 'k'}
      }
    ]
  },

  // (f, d) => d.xxx(v => !f(v))
  ...map(
    value => ({
      type: 'functionDef',
      args: ['f', 'd'],
      children: [
        {
          type: 'functionCall',
          func: {
            type: 'property',
            parent: {type: 'id', value: 'd'},
            value
          },
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
                      func: {type: 'id', value: 'f'},
                      children: [{type: 'id', value: 'r'}]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }),
    {
      reject: 'filter',
      none: 'every'
    }
  ),

  // (f, d) => d.xxx(f)
  ...map(
    value => ({
      type: 'functionDef',
      args: ['f', 'd'],
      children: [
        {
          type: 'functionCall',
          func: {
            type: 'property',
            parent: {type: 'id', value: 'd'},
            value
          },
          children: [{type: 'id', value: 'f'}]
        }
      ]
    }),
    {
      filter: 'filter',
      map: 'map',
      any: 'some',
      all: 'every'
    }
  ),

  // (p, d) => d.map(u => u[p])
  pluck: {
    type: 'functionDef',
    args: ['p', 'd'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'd'},
          value: 'map'
        },
        children: [
          {
            type: 'functionDef',
            args: ['u'],
            children: [
              {
                type: 'property',
                parent: {type: 'id', value: 'u'},
                value: {type: 'id', value: 'p'}
              }
            ]
          }
        ]
      }
    ]
  },

  // n => n === null || n === undefined
  isNil: {
    type: 'functionDef',
    args: ['n'],
    children: [
      {
        type: '||',
        children: [
          {
            type: '===',
            children: [{type: 'id', value: 'n'}, {type: 'id', value: 'null'}]
          },
          {
            type: '===',
            children: [
              {type: 'id', value: 'n'},
              {type: 'id', value: 'undefined'}
            ]
          }
        ]
      }
    ]
  },

  // a => a.flat()
  unnest: {
    type: 'functionDef',
    args: ['u'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'u'},
          value: 'flat'
        },
        children: []
      }
    ]
  },

  // x => x + 1
  ...map(
    type => ({
      type: 'functionDef',
      args: ['x'],
      children: [
        {
          type,
          children: [{type: 'id', value: 'x'}, {type: 'number', value: '1'}]
        }
      ]
    }),
    {inc: '+', dec: '-'}
  ),

  // (p, f, w) => p(w) ? f(w) : w;
  when: {
    type: 'functionDef',
    args: ['p', 'f', 'w'],
    children: [
      {
        type: 'ternary',
        children: [
          {
            type: 'functionCall',
            func: {type: 'id', value: 'p'},
            children: [{type: 'id', value: 'w'}]
          },
          {
            type: 'functionCall',
            func: {type: 'id', value: 'f'},
            children: [{type: 'id', value: 'w'}]
          },
          {type: 'id', value: 'w'}
        ]
      }
    ]
  },

  // (p, f, w) => p(w) ? w : f(w);
  unless: {
    type: 'functionDef',
    args: ['p', 'f', 'w'],
    children: [
      {
        type: 'ternary',
        children: [
          {
            type: 'functionCall',
            func: {type: 'id', value: 'p'},
            children: [{type: 'id', value: 'w'}]
          },
          {type: 'id', value: 'w'},
          {
            type: 'functionCall',
            func: {type: 'id', value: 'f'},
            children: [{type: 'id', value: 'w'}]
          }
        ]
      }
    ]
  },

  // (p, t, e, d) => p(d) ? t(d) : e(d)
  ifElse: {
    type: 'functionDef',
    args: ['p', 't', 'e', 'd'],
    children: [
      {
        type: 'ternary',
        children: [
          {
            type: 'functionCall',
            func: {type: 'id', value: 'p'},
            children: [{type: 'id', value: 'd'}]
          },
          {
            type: 'functionCall',
            func: {type: 'id', value: 't'},
            children: [{type: 'id', value: 'd'}]
          },
          {
            type: 'functionCall',
            func: {type: 'id', value: 'e'},
            children: [{type: 'id', value: 'd'}]
          }
        ]
      }
    ]
  },

  ...map(
    type => ({
      type: 'functionDef',
      args: ['a', 'b'],
      children: [
        {type, children: [{type: 'id', value: 'a'}, {type: 'id', value: 'b'}]}
      ]
    }),
    {
      add: '+',
      subtract: '-',
      multiply: '*',
      divide: '/',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      modulo: '%',
      or: '||',
      and: '&&'
    }
  ),

  // n => !n
  not: {
    type: 'functionDef',
    args: ['n'],
    children: [
      {
        type: '!',
        children: [{type: 'id', value: 'n'}]
      }
    ]
  },

  ...map(
    value => ({
      type: 'functionDef',
      args: [],
      children: [{type: 'boolean', value}]
    }),
    {T: true, F: false}
  ),

  // (a, d) => a
  always: {
    type: 'functionDef',
    args: ['a', 'd'],
    children: [{type: 'id', value: 'a'}]
  },

  // a => a
  identity: {
    type: 'functionDef',
    args: ['a'],
    children: [{type: 'id', value: 'a'}]
  },

  // (k, v, d) => ({...d, k: v})
  assoc: {
    type: 'functionDef',
    args: ['k', 'v', 'd'],
    children: [
      {
        type: 'object',
        children: [
          {
            type: 'spread',
            value: {type: 'id', value: 'd'}
          },
          {
            type: 'pair',
            key: {type: 'id', value: 'k'},
            value: {type: 'id', value: 'v'}
          }
        ]
      }
    ]
  },

  // (k, v, d) => equals(d[k], v)
  propEq: {
    type: 'functionDef',
    args: ['k', 'v', 'd'],
    children: [
      {
        // type: 'functionCall',
        // func: {type: 'id', value: 'equals'},
        type: '==',
        children: [
          {
            type: 'property',
            parent: {type: 'id', value: 'd'},
            value: {type: 'id', value: 'k'}
          },
          {type: 'id', value: 'v'}
        ]
      }
    ]
  },

  // a => a[0]
  head: {
    type: 'functionDef',
    args: ['a'],
    children: [
      {
        type: 'property',
        parent: {type: 'id', value: 'a'},
        value: {type: 'number', value: 0}
      }
    ]
  },
  // a => a[a.length - 1]
  last: {
    type: 'functionDef',
    args: ['a'],
    children: [
      {
        type: 'property',
        parent: {type: 'id', value: 'a'},
        value: {
          type: '-',
          children: [
            {
              type: 'property',
              parent: {type: 'id', value: 'a'},
              value: 'length'
            },
            {
              type: 'number',
              value: 1
            }
          ]
        }
      }
    ]
  },
  // a => a.slice(0, -1)
  init: {
    type: 'functionDef',
    args: ['a'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'a'},
          value: 'slice'
        },
        children: [{type: 'number', value: 0}, {type: 'number', value: -1}]
      }
    ]
  },
  // a => a.slice(1)
  tail: {
    type: 'functionDef',
    args: ['a'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'a'},
          value: 'slice'
        },
        children: [{type: 'number', value: 1}]
      }
    ]
  },
  // a => a.slice(n)
  drop: {
    type: 'functionDef',
    args: ['n', 'a'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'a'},
          value: 'slice'
        },
        children: [{type: 'id', value: 'n'}]
      }
    ]
  },

  // (f, g, d) => f(d) && g(d)
  ...map(
    type => ({
      type: 'functionDef',
      args: ['f', 'g', 'd'],
      children: [
        {
          type,
          children: [
            {
              type: 'functionCall',
              func: {type: 'id', value: 'f'},
              children: [{type: 'id', value: 'd'}]
            },
            {
              type: 'functionCall',
              func: {type: 'id', value: 'g'},
              children: [{type: 'id', value: 'd'}]
            }
          ]
        }
      ]
    }),
    {both: '&&', either: '||'}
  ),

  // (t, d) => d != null && d.constructor == t
  is: {
    type: 'functionDef',
    args: ['t', 'd'],
    children: [
      {
        type: '&&',
        children: [
          {
            type: '!=',
            children: [{type: 'id', value: 'd'}, {type: 'id', value: 'null'}]
          },
          {
            type: '===',
            children: [
              {
                type: 'property',
                parent: {type: 'id', value: 'd'},
                value: 'constructor'
              },
              {type: 'id', value: 't'}
            ]
          }
        ]
      }
    ]
  },

  // (f, d) => !f(d)
  complement: {
    type: 'functionDef',
    args: ['f', 'd'],
    children: [
      {
        type: '!',
        children: [
          {
            type: 'functionCall',
            func: {type: 'id', value: 'f'},
            children: [{type: 'id', value: 'd'}]
          }
        ]
      }
    ]
  },

  // (a, b) => a.concat(b)
  concat: {
    type: 'functionDef',
    args: ['a', 'b'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'a'},
          value: 'concat'
        },
        children: [{type: 'id', value: 'b'}]
      }
    ]
  },

  // (e, a) => a.concat(e)
  append: {
    type: 'functionDef',
    args: ['e', 'a'],
    children: [
      {
        type: 'functionCall',
        func: {
          type: 'property',
          parent: {type: 'id', value: 'a'},
          value: 'concat'
        },
        children: [{type: 'id', value: 'e'}]
      }
    ]
  }

  // over,
  // concat,
  // curry,
  // pathEq,
  // reduce,
  // equals,
  // append,
  // length,
  // __,
  // call,
  // defaultTo,
  // of,
  // lensPath,
  // isEmpty,
  // prepend,
  // slice,
  // allPass,
  // toPairs,
  // keys,
  // join,
  // propSatisfies,
  // drop
};

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

// (a, d) => ((d || {}).a0 || {}).a1 ...
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

// (a, v, d) => {...(d || {}), [a[0]]: {...(d[a[0]] || {}), [a[1]]: v}}
// assocPath([], 5) // d => 5
// assocPath(['things'], 6) // d => {...d, things: 6}
// assocPath(['ab', 'cd', 'ef'], '123') // d => {...d, ab: {...d.ab, cd: {...d.ab.cd, ef: v}}}
// const unassocPath = treeMap(
//   pathEq(['func', 'value'], 'assocPath'),
//   ({children: [arr, value, data]}) => {
//     let ob = {type: 'id', value: 'v'};
//     // for (var i = arr.length - 1; i >= 0; i--) {
//     //   ob = {
//     //     type: 'object',
//     //     children: [{
//     //       type: 'spread',
//     //       value: {
//     //         type:
//     //       }
//     //     }]
//     //   }
//     // }
//     return {
//       type: 'functionDef',
//       args: ['a', 'v', 'd'],
//       children: [ob]
//     };
//   }
// );

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
          args: drop(children.length, func.args),
          children: [
            children.reduce(
              (res, value, i) =>
                treeReplace({type: 'id', value: func.args[i]}, value, res),
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
