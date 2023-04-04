const reservedWords = ['do', 'else', 'if', 'while'];

// takes a string and returns an array of tokens.
// a token looks like {type: ';'} or {type: 'number', value: 51}
export const tokenize = (inputStr) =>
  (inputStr.match(/\d+|[a-z_]+|[{}()<;=+-]/g) || []).map((t) =>
    t == +t
      ? {type: 'number', value: +t}
      : t && !reservedWords.includes(t) && /^[a-z_]+$/.test(t)
      ? {type: 'variable', value: t}
      : {type: t}
  );
