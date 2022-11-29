/* eslint-disable no-use-before-define */

const trunc = (str, len = 32) => {
  str = str.replace(/\s+/g, ' ');
  return str.length > len ? str.slice(0, len - 3) + '...' : str;
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseRegex = (regex, str, index, type, path) => {
  const m = str.match(regex);
  if (m) return {type, value: m[0], length: m[0].length};

  const error = `Expected "${type}" at "${trunc(str)}"\n${path.join(' ')}`;
  return {errors: [{error, index}]};
};

const parseOr = (options, str, grammar, index, path) => {
  const errors = [];
  for (const option of options) {
    const value = parse(str, grammar, index, [...path, option]);
    if (value.errors) errors.push(...value.errors);
    else return value;
  }
  return {errors: errors.sort((a, b) => b.index - a.index)};
};

export const parse = (str, grammar, index = 0, path = ['main']) => {
  const type = path[path.length - 1];

  if (!grammar[type]) {
    grammar[type] = new RegExp(`^(${escapeRegExp(type)})\\s*`);
  }

  if (grammar[type] instanceof RegExp) {
    return parseRegex(grammar[type], str.slice(index), index, type, path);
  }

  const result = [];
  let length = 0;
  for (const el of grammar[type]) {
    const optional = el.length > 1 && el[el.length - 1] === '?';
    const elNoQm = optional ? el.slice(0, -1) : el;
    const value =
      elNoQm.length > 1 && elNoQm.includes('|')
        ? parseOr(elNoQm.split('|'), str, grammar, index + length, path)
        : parse(str, grammar, index + length, [...path, elNoQm]);
    if (value.errors) {
      if (!optional) return value;
      // TODO: what do you do with errors of optional things?
    } else {
      result.push(value);
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
        const [, name, val] = l.trim().match(/([^:\s]+)\s*:\s*(.*)/);
        return [name, val[0] === '^' ? new RegExp(val) : val.split(' ')];
      })
  );
