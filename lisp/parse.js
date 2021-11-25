const tokenize = (str) => str.match(/\(|\)|"[^"]*"|'|[^\s()]+/g);

const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === '(') indexes.push(result.length);
    else if (t === ')') {
      if (!indexes.length) throw new Error('Unexpected )');
      result.push(result.splice(indexes.pop())); // am I bad person?
    } else result.push(isNaN(t) ? t : Number(t));
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

const parseQuote = (node) => {
  if (!Array.isArray(node)) return node;
  const res = [];
  for (const n of node) {
    if (res[res.length - 1] === "'")
      res.splice(res.length - 1, 1, ['quote', parseQuote(n)]);
    else if (n[0] === '"' && n[n.length - 1] === '"')
      res.push(['quote', n.slice(1, -1)]);
    else res.push(parseQuote(n));
  }
  return res;
};

export const parse = (str) => parseQuote(nest(tokenize(str)));
