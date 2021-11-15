export const tokenize = (str) =>
  str
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/squared? (\w+)/g, '$12')
    .replace(/cubic (\w+)/g, '$13')
    .replace(/ per /g, ' / ')
    .replace(/ for /g, ' * ')
    .match(/\(|\)|-?\d+(\.\d+)?(e\+?-?\d+)?|\w+|\+|-|\^|\*|\//g)
    ?.map((x) => (isNaN(x) ? x : Number(x)));

const precedence = {to: 1, '+': 2, '-': 3, '*': 4, '/': 5, '^': 6};

const getIndexOfOp = (tokens) => {
  let depth = 0;
  let minIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '(') depth++;
    else if (t === ')') depth--;
    else if (
      !depth &&
      precedence[t] &&
      (minIndex === -1 || precedence[t] < precedence[tokens[minIndex]])
    ) {
      minIndex = i;
    }
  }
  return minIndex;
};

const parseUnits = (units) => units;
// units.reduce((result, u) => {
//   const m = u.match(/^([a-z_]+)(\d*)$/);
//   if (!m) throw new Error(`Unrecognizable unit: "${u}"`);
//   const unit = m[1];
//   const exponent = Number(m[2] || 1);
//   result[unit] = (result[unit] || 0) + exponent;
//   return result;
// }, {});

export const parse = (tokens = []) => {
  const indexOfOp = getIndexOfOp(tokens);
  return indexOfOp > -1
    ? {
        op: tokens[indexOfOp],
        left: parse(tokens.slice(0, indexOfOp)),
        right: parse(tokens.slice(indexOfOp + 1)),
      }
    : tokens[0] === '(' && tokens[tokens.length - 1] === ')'
    ? parse(tokens.slice(1, -1))
    : typeof tokens[0] === 'number'
    ? {op: 'val', left: tokens[0], right: parseUnits(tokens.slice(1))}
    : {op: 'val', left: 1, right: parseUnits(tokens)};
};
