const tokenRegex = /\(|\)|"[^"]*"|'|[^\s()]+/g;

const getAllMatches = (regex, str) => {
  const result = [];
  let match;
  while ((match = regex.exec(str))) result.push(match);
  return result;
};

export const tokenize = (str) =>
  str.split('\n').flatMap((line, lineNum) =>
    getAllMatches(tokenRegex, line.replace(/\/\/.*/, '')).map((m) => ({
      val: m[0],
      loc: lineNum + ':' + m.index,
    }))
  );

const nest = (tokens) => {
  const indexes = [];
  let result = [];
  for (const {val, loc} of tokens) {
    if (val === '(') indexes.push(result.length);
    else if (val === ')') {
      if (!indexes.length) throw new Error(`Unexpected ) at ${loc}`);
      result.push(result.splice(indexes.pop())); // am I bad person?
      // result = [...result.slice(index), [result.slice(index)]] // TODO
    } else result.push({val: isNaN(val) ? val : Number(val), loc});
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

const last = (arr) => arr[arr.length - 1];

const parseQuote = (node) => {
  if (!Array.isArray(node)) return node;
  const res = [];
  for (const n of node) {
    if (last(res)?.val === "'")
      res.splice(res.length - 1, 1, [
        {val: 'quote', loc: n.loc},
        parseQuote(n),
      ]);
    else if (n.val?.[0] === '"' && last(n.val) === '"')
      res.push([
        {val: 'quote', loc: n.loc},
        {val: n.val.slice(1, -1).replace(/\\n/g, '\n'), loc: n.loc},
      ]);
    else res.push(parseQuote(n));
  }
  return res;
};

export const parse = (str) => parseQuote(nest(tokenize(str)));
