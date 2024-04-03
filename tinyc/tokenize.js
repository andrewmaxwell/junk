const reservedWords = [
  'do',
  'else',
  'if',
  'while',
  'for',
  'function',
  'return',
];

// takes a string and returns an array of tokens.
// a token looks like {type: ';'} or {type: 'number', value: 51}
export const tokenize = (inputStr) =>
  inputStr
    .match(/\d+|[a-z_]\w*|==|<=|>=|!=|&&|\|\||[{}()<>;=+,*/%!-]|"[^"]*"/gi)
    .map((t) => {
      if (t == +t) return {type: 'number', value: +t};
      if (t[0] === '"') return {type: 'string', value: t.slice(1, -1)};
      if (/^[a-z_]\w*$/i.test(t) && !reservedWords.includes(t))
        return {type: 'var', value: t};
      return {type: t};
    });
