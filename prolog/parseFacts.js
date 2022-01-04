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

export const parseFacts = (str) =>
  str
    .split(/\.\s*/)
    .map((s) => s.match(/\(|\)|:-|\\=|\/\*.*\*\/|\w+/g))
    .filter((i) => i)
    .map((tokens) =>
      nest(tokens).reduce((res, el) => {
        if (Array.isArray(el) && typeof res[res.length - 1] === 'string') {
          res.push({pred: res.pop(), args: el});
        } else if (res[res.length - 1] === '\\=') {
          res.push({op: res.pop(), args: [res.pop(), el]});
        } else if (el && !el.startsWith('/*')) res.push(el);
        return res;
      }, [])
    )
    .flatMap((s) => (s[1] === ':-' ? {...s[0], conditions: s.slice(2)} : s));
