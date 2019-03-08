'use strict';

const {fromPairs, curry} = window.R;

const precendence = {
  functionDef: 2,
  functionCall: 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  '%': 5,
  '||': 6,
  '&&': 7,
  property: 8
};
const indent = str => str.replace(/\n/g, '\n  ');
const joinChildren = curry((op, el) =>
  el.children.map(c => toJS(c, el)).join(op)
);

const toJSMappings = {
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
  property: el => toJS(el.parent, el) + '.' + el.value,
  object: () => `{}`,
  '!': el => '!' + toJS(el.children[0], el),
  ...fromPairs(
    [
      '||',
      '&&',
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
  )
};

export const toJS = (el, parent) => {
  if (!el || !el.type) return '/*' + JSON.stringify(el) + '*/';
  const syntax = toJSMappings[el.type](el);
  return parent &&
    parent.type !== el.type &&
    precendence[parent.type] >= precendence[el.type]
    ? '(' + syntax + ')'
    : syntax;
};
