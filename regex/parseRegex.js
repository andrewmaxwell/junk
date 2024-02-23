export const pipe =
  (...funcs) =>
  (data) =>
    funcs.reduce((r, f) => f(r), data);

const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '(' && tokens[i - 1] !== '\\')
      indexes.push(result.length);
    else if (tokens[i] === ')' && tokens[i - 1] !== '\\') {
      if (!indexes.length) throw new Error('Unexpected )');
      result.push(result.splice(indexes.pop()));
    } else result.push(tokens[i]);
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

const treeMap = (func) => (ob) => {
  if (!ob || typeof ob !== 'object') return func(ob);
  const res = Array.isArray(ob) ? [] : {};
  for (const key in ob) res[key] = treeMap(func)(ob[key]);
  return func(res);
};

const arraySplit = (splitEl, arr) => {
  const result = [[]];
  for (const el of arr) {
    if (el === splitEl) result.push([]);
    else result[result.length - 1].push(el);
  }
  return result;
};

const postfixOps = ['?', '+', '*'];

const parsePostfixOps = treeMap((node) => {
  if (!Array.isArray(node)) return node;
  return node.reduce((res, el) => {
    res.push(
      postfixOps.includes(el)
        ? {type: el, value: res.pop()}
        : typeof el === 'string' && el !== '|'
        ? {type: 'literal', value: el}
        : el
    );
    return res;
  }, []);
});

const parseOrs = treeMap((node) =>
  Array.isArray(node) && node.includes('|')
    ? {type: '|', value: arraySplit('|', node)}
    : node
);

const parseSequences = (node) => {
  if (Array.isArray(node)) {
    return node.length === 1
      ? parseSequences(node[0])
      : {type: 'sequence', value: node.map(parseSequences)};
  }
  if (node && typeof node === 'object') {
    return {
      ...node,
      value:
        node.type === '|'
          ? node.value.map(parseSequences)
          : parseSequences(node.value),
    };
  }
  return node;
};

export const parseRegex = pipe(nest, parsePostfixOps, parseOrs, parseSequences);
