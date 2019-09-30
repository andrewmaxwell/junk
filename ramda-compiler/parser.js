import {treeMap} from './utils.js';
import {tokenize} from './tokenize.js';

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
    pipe(
      reduce(
        (res, el) =>
          res.length &&
          el.type === 'argList' &&
          ['id', 'property'].includes(last(res).type)
            ? [
                ...init(res),
                {
                  type: 'functionCall',
                  func: last(res),
                  children: el.children
                }
              ]
            : [...res, el],
        []
      ),
      unnest
    )
  )
);

const parseList = (tokenType, type) =>
  treeMap(
    when(
      propEq('type', tokenType),
      pipe(
        prop('children'),
        when(
          includes({type: ',', value: ','}),
          pipe(
            reduce(
              (res, el) =>
                el.type === ','
                  ? [...res, []]
                  : over(lensIndex(-1), append(el), res),
              [[]]
            ),
            map(when(propEq('length', 1), head))
          )
        ),
        children => ({type, children})
      )
    )
  );

const parseProperties = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length > 1 && last(res).type === '.'
          ? [
              ...slice(0, -2, res),
              {
                type: 'property',
                parent: nth(-2, res),
                value: el.value
              }
            ]
          : [...res, el],
      []
    )
  )
);

const parseIndexes = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length && el.type === '[' && last(res).type === 'id'
          ? [
              ...init(res),
              {
                type: 'property',
                parent: last(res),
                value: el.children[0]
              }
            ]
          : [...res, el],
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
    both(is(Array), includes({type: '!', value: '!'})),
    reduce(
      (res, el) =>
        res.length && last(res).type === '!'
          ? [...init(res), {type: '!', children: [el]}]
          : [...res, el],
      []
    )
  )
);

const parseInfix = type =>
  treeMap(
    when(
      both(is(Array), includes({type, value: type})),
      pipe(
        reduce(
          (res, el) =>
            equals(el, {type, value: type})
              ? [...res, []]
              : over(lensIndex(-1), append(el), res),
          [[]]
        ),
        children => [{type, children}]
      )
    )
  );

/*

  a ? b ? c : d : e
  [a, [b, c, d], e]

  a ? b : c ? d : e
  [a, b, [c, d, e]]

  */

const parseTernaries = treeMap(
  when(
    both(is(Array), includes({type: '?', value: '?'})),
    pipe(
      reduce(
        (res, el) =>
          el.type === '?' || el.type === ':'
            ? [...res, []]
            : over(lensIndex(-1), append(el), res),
        [[]]
      ),
      children => [{type: 'ternary', children}]
    )
  )
);

const parseSimplePairs = treeMap(
  when(
    allPass([is(Array), pathEq([0, 'type'], 'id'), pathEq([1, 'type'], ':')]),
    ([{value}, , ...children]) => [
      {
        type: 'pair',
        key: {type: 'string', value},
        value: children
      }
    ]
  )
);

const parseDynamicProps = treeMap(
  when(
    allPass([
      is(Array),
      pathEq([0, 'type'], 'array'),
      pathEq([1, 'type'], ':')
    ]),
    ([key, , ...children]) => ({
      type: 'pair',
      key: key.children[0],
      value: children
    })
  )
);

const parseSpreads = treeMap(
  when(
    is(Array),
    reduce(
      (res, el) =>
        res.length && last(res).type === '...'
          ? [...init(res), {type: 'spread', value: el}]
          : [...res, el],
      []
    )
  )
);

export const parse = (input, debug) =>
  pipe(
    tokenize,
    reject(propEq('type', 'space')),
    // tap(d => console.log('tokenized', input, d)),
    nest('(', ')'),
    nest('[', ']'),
    nest('{', '}'),
    parseIndexes,
    parseList('[', 'array'),
    parseList('(', 'argList'),
    parseList('{', 'object'),
    parseSimplePairs,
    parseDynamicProps,
    parseFunctionDefs,
    parseTernaries,
    parseInfix('||'),
    parseInfix('&&'),
    parseInfix('==='),
    parseInfix('=='),
    parseInfix('!=='),
    parseInfix('!='),
    parseInfix('>'),
    parseInfix('>='),
    parseInfix('<'),
    parseInfix('<='),
    parseInfix('+'),
    parseInfix('-'),
    parseInfix('*'),
    parseInfix('/'),
    parseInfix('%'),
    parseInfix('**'),
    parseProperties,
    parseFunctionCalls,
    parseNot,
    parseSpreads,
    ifElse(c => c.length > 1, children => ({type: 'program', children}), head),
    tap(output => debug && console.log('parsed', input, output))
  )(input);
