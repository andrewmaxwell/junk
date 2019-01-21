'use strict';

const indent = str => str.replace(/\n/g, '\n  ');

const toJSMappings = {
  functionDef: el =>
    (el.args.length === 1 ? el.args.join(', ') : `(${el.args.join(', ')})`) +
    ' => ' +
    (el.children.length === 1
      ? toJS(el.children[0])
      : '{' + el.children.map(toJS).join(';') + '}'),
  functionCall: el => {
    var s = toJS(el.func) + '(' + el.children.map(toJS).join(', ') + ')';
    return s.length > 80
      ? toJS(el.func) +
          indent('(\n' + el.children.map(toJS).join(',\n')) +
          '\n)'
      : s;
  },
  array: el => `[${el.children.map(toJS).join(', ')}]`,
  string: el => `'${el.value}'`,
  id: el => el.value,
  property: el => toJS(el.parent) + '.' + el.value,
  object: () => `{}`,
  '!': el => `!(${toJS(el.children[0])})`,
  '||': el => `(${el.children.map(toJS).join(' || ')})`,
  '&&': el => `(${el.children.map(toJS).join(' && ')})`,
  '===': el => el.children.map(toJS).join(' === '),
  '!==': el => el.children.map(toJS).join(' !== ')
};

export const toJS = el =>
  toJSMappings[el.type]
    ? toJSMappings[el.type](el)
    : console.error('No JS mapping', el.type) || 'ERROR';
