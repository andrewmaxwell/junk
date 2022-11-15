const trunc = (str, len = 20) => {
  str = str.replace(/\n/g, '\\n');
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
};

export const parse = (str, grammar, path = ['main']) => {
  const type = path[path.length - 1];
  const g = grammar[type];

  if (!g) {
    console.log('literal', type, str);
    return str.startsWith(type)
      ? {type: '', value: type, length: String(type).length}
      : {error: `Expected "${type}" at "${trunc(str)}" (${path.join('.')})`};
  }

  if (g instanceof RegExp) {
    console.log('regex', type, str);
    const m = str.match(g);
    return m
      ? {type, value: m[1] || m[0], length: m[0].length}
      : {error: `Expected ${type} at "${trunc(str)}" (${path.join('.')})`};
  }

  if (g.any) {
    console.log('any', type, str);
    const errors = [];
    for (const el of g.any) {
      const value = parse(str, grammar, [...path, el]);
      if (value.error) errors.push(value.error);
      else return value;
    }
    return {error: errors.join('\nOR\n')};
  }

  if (g.concat) {
    console.log('concat', type, str);
    const result = [];
    let length = 0;
    for (const el of g.concat) {
      const optional = el.length > 1 && el[el.length - 1] === '?';
      const value = parse(str.slice(length), grammar, [
        ...path,
        optional ? el.slice(0, -1) : el,
      ]);
      if (!value.error) {
        result.push(value);
        length += value.length;
      } else if (!optional) return value;
    }
    return {type, value: result, length};
  }
};
