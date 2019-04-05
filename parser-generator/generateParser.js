const {map, is, reduce, reduced, evolve, append, add} = window.R;

const match = (defs, type, tokens, stack = []) =>
  is(Function, type)
    ? type(defs, tokens, stack.concat(type))
    : defs[type]
    ? {type, ...defs[type](defs, tokens, stack.concat(type))}
    : tokens.length && type === tokens[0].type
    ? {...tokens[0], length: 1}
    : {
        error: `Expected ${type}, got ${tokens
          .slice(0, 3)
          .map(t => t.value)
          .join(' ')}`,
        stack
      };

const seq = arr => (defs, tokens, stack) =>
  reduce(
    (res, m) => {
      const child = match(defs, m, tokens.slice(res.length), stack);
      return child.error
        ? reduced(child)
        : evolve({children: append(child), length: add(child.length)}, res);
    },
    {children: [], length: 0},
    arr
  );

const num = (matcher, min, max) => (defs, tokens, stack) => {
  const children = [];
  let tokenIndex = 0;
  for (let i = 0; i < max; i++) {
    const child = match(defs, matcher, tokens.slice(tokenIndex), stack);
    if (child.error) {
      if (i >= min) break;
      else return child;
    }
    children.push(child);
    tokenIndex += child.length;
  }
  return {children, length: tokenIndex};
};

const or = arr => (defs, tokens, stack) => {
  const errors = [];
  for (let i = 0; tokens.length && i < arr.length; i++) {
    if (stack.length > 13) {
      console.log('stack', stack, arr[i]);
      continue;
    }
    const m = match(defs, arr[i], tokens, stack);
    if (m.error) errors.push(m);
    else return m;
  }
  return {error: errors, stack};
};

const processDef = def =>
  def.length > 1 && def.endsWith('?')
    ? num(def.slice(0, -1), 0, 1)
    : def.length > 1 && def.endsWith('+')
    ? num(def.slice(0, -1), 1, Infinity)
    : def.length > 1 && def.endsWith('*')
    ? num(def.slice(0, -1), 0, Infinity)
    : def;

const convertDefs = map(def =>
  def.includes('|')
    ? or(def.match(/(?:\\\||[^|])+/g).map(processDef))
    : seq(def.split(' ').map(processDef))
);

export const generateParser = defs => tokens =>
  match(convertDefs(defs), 'main', tokens);
