const trunc = (str, len = 32) => {
  str = str.replace(/\s+/g, ' ');
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseOr = (arr, str, grammar, index, path) => {
  const errors = [];
  for (const p of arr) {
    // eslint-disable-next-line no-use-before-define
    const value = parse(str, grammar, index, [...path, p]);
    if (value.errors) errors.push(...value.errors);
    else return value;
  }
  return {errors: errors.sort((a, b) => b.index - a.index)};
};

export const parse = (str, grammar, index = 0, path = ['main']) => {
  const type = path[path.length - 1];
  const g =
    grammar[type] ||
    (grammar[type] = new RegExp(`^(${escapeRegExp(type)})\\s*`));

  if (g instanceof RegExp) {
    const m = str.slice(index).match(g);
    if (m) return {type, value: m[1] || m[0], length: m[0].length};

    const error = `Expected "${type}" at "${trunc(
      str.slice(index)
    )}"\n${path.join(' ')}`;

    return {errors: [{error, index}]};
  }

  const result = [];
  let length = 0;
  for (const el of g) {
    const optional = el.length > 1 && el[el.length - 1] === '?';
    const elNoQm = optional ? el.slice(0, -1) : el;
    const value =
      elNoQm.length > 1 && elNoQm.includes('|')
        ? parseOr(elNoQm.split('|'), str, grammar, index + length, path)
        : parse(str, grammar, index + length, [...path, elNoQm]);
    if (value.errors) {
      if (!optional) return value;
    } else {
      result.push(
        Array.isArray(value.value) && value.value.length === 1
          ? value.value
          : value
      );
      length += value.length;
    }
  }
  return {type, value: result, length};
};

export const parseGrammar = (str) =>
  Object.fromEntries(
    str
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const name = l.split(':', 1)[0];
        const val = l.slice(name.length + 1).trim();
        return [name.trim(), val[0] === '^' ? new RegExp(val) : val.split(' ')];
      })
  );
