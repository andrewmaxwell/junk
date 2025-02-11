import {parse} from '../lisp/parse.js';

const printData = (data) => {
  if (data[0]?.val === 'quote') return printData(data[1]);
  if (data.length) return `[${data.map(printData).join(', ')}]`;
  if (typeof data.val === 'string') return `"${data.val ?? ''}"`;
  return data.val;
};

const toJS = (code) => {
  if (!Array.isArray(code)) return code.val;

  switch (code[0].val) {
    case 'defun': {
      const funcName = code[1].val;
      const args = code[2].map((p) => p.val).join(', ');
      return `const ${funcName} = (${args}) => ${toJS(code[3])};`;
    }
    case 'cond':
      return (
        '(' +
        code
          .slice(1)
          .map(([pred, body]) => `isTruthy(${toJS(pred)}) ? ${toJS(body)}`)
          .join(' : ') +
        ' : [])'
      );
    case 'eq':
      return `${toJS(code[1])} == ${toJS(code[2])}`;
    case 'car':
      return `${toJS(code[1])}[0]`;
    case 'cdr':
      return `${toJS(code[1])}.slice(1)`;
    case 'quote':
      return printData(code[1]);
    case 'cons':
      return `[${toJS(code[1])}, ...${toJS(code[2])}]`;
    case 'list':
      return `[${code.slice(1).map(toJS).join(', ')}]`;
    case 'lambda':
      return `(${code[1].map((p) => p.val).join(', ')}) => ${toJS(code[2])}`;
    default:
      return `${code[0].val}(${code.slice(1).map(toJS).join(', ')})`;
  }
};

export const transpile = (lispStr) =>
  `const isTruthy = (x) => x && (!Array.isArray(x) || x.length);\n\n${parse(lispStr).map(toJS).join('\n\n')}`;
