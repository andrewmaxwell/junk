'use strict';

const {fromPairs, curry} = window.R;

const precendence = {
  functionDef: 1,
  ternary: 2,
  functionCall: 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  '||': 6,
  '&&': 7,
  '!': 8,
  property: 10
};
const indent = str => str.replace(/\n/g, '\n  ');
const joinChildren = curry((op, el) =>
  el.children.map(c => toJS(c, el)).join(op)
);

const toJSMappings = {
  program: joinChildren('\n\n'),
  functionDef: el =>
    (el.args.length === 1 ? el.args.join(', ') : `(${el.args.join(', ')})`) +
    ' => ' +
    (el.children.length === 1
      ? toJS(el.children[0], el)
      : '{' + joinChildren(';', el) + '}'),
  functionCall: el => {
    var s = toJS(el.func, el) + '(' + joinChildren(', ', el) + ')';
    return s.length > 80
      ? toJS(el.func, el) + indent('(\n' + joinChildren(',\n', el)) + '\n)'
      : s;
  },
  array: el => `[${joinChildren(', ', el)}]`,
  string: el => `'${el.value}'`,
  id: el => el.value,
  number: el => el.value,
  boolean: el => el.value,
  property: el =>
    toJS(el.parent, el) +
    (typeof el.value === 'string'
      ? '.' + el.value
      : el.value.type === 'string'
      ? '.' + el.value.value
      : `[${toJS(el.value, el)}]`),
  object: el => `{${joinChildren(', ', el)}}`,
  '!': el => '!' + toJS(el.children[0], el),
  ...fromPairs(
    [
      '||',
      '&&',
      '==',
      '!=',
      '===',
      '!==',
      '+',
      '-',
      '*',
      '/',
      '>',
      '>=',
      '<',
      '<=',
      '%'
    ].map(o => [o, joinChildren(` ${o} `)])
  ),
  ternary: el =>
    toJS(el.children[0], el) +
    ' ? ' +
    toJS(el.children[1], el) +
    ' : ' +
    toJS(el.children[2], el),
  spread: el => `...${toJS(el.value, el)}`,
  pair: el =>
    `${
      el.key.type === 'string' ? el.key.value : `[${toJS(el.key, el)}]`
    }: ${toJS(el.value, el)}`,
  comment: el => `//${el.value}`,
  argList: el => `(${joinChildren(', ', el)})`
};

export const toJS = (el, parent) => {
  if (Array.isArray(el)) return el.map(e => toJS(e, parent)).join('~~~');
  if (!el || !toJSMappings[el.type]) return '/*' + JSON.stringify(el) + '*/';
  const syntax = toJSMappings[el.type](el);
  return parent &&
    parent.type !== el.type &&
    precendence[parent.type] >= precendence[el.type]
    ? '(' + syntax + ')'
    : syntax;
};
