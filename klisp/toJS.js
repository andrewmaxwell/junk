'use strict';

const indent = str => str.replace(/\n/g, '\n  ');

const ch = (el, del) => el.children.map(toJS).join(del);

const toJSMappings = {
  declaration: el => `const ${toJS(el.name)} = ${toJS(el.children)}`,
  functionDef: el =>
    `function(${el.args.join(', ')}){${indent('\n' + ch(el, ';\n'))};\n}`,
  functionCall: el => {
    var args = '(' + ch(el, ', ') + ')';
    return (
      toJS(el.func) +
      (args.length > 80 ? indent('(\n' + ch(el, ',\n')) + '\n)' : args)
    );
  },
  array: el => `[${ch(el, ', ')}]`,
  string: el => `'${el.value}'`,
  id: el => el.value,
  number: el => el.value,
  rest: el => `...${toJS(el.value)}`,
  property: el =>
    toJS(el.parent) +
    (/^[a-z][a-z0-9_$]*$/i.test(el.value) ? `.${el.value}` : `[${el.value}]`),
  ternary: el =>
    `${toJS(el.children[0])} ? ${toJS(el.children[1])} : ${toJS(
      el.children[2]
    )}`,
  return: el => `return ${ch(el, ', ')}`,
  '!': el => `!(${ch(el, ', ')})`,
  '||': el => `(${ch(el, ' || ')})`,
  '&&': el => `(${ch(el, ' && ')})`,
  '===': el => ch(el, ' === '),
  '!==': el => ch(el, ' !== '),
  '+': el => ch(el, ' + '),
  '-': el => ch(el, ' - '),
  '*': el => ch(el, ' * '),
  '/': el => ch(el, ' / '),
  '<': el => ch(el, ' < '),
  '<=': el => ch(el, ' <= '),
  '>': el => ch(el, ' > '),
  '>=': el => ch(el, ' >= '),
  '(': el => `(${ch(el, ', ')})`
};

export const toJS = el =>
  el && toJSMappings[el.type]
    ? toJSMappings[el.type](el)
    : console.error('No JS mapping', el) || `**${JSON.stringify(el)}**`;
