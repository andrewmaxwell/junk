const nest = (tokens) => {
  const indexes = [];
  const result = [];
  for (const t of tokens) {
    if (t === '(') indexes.push(result.length);
    else if (t === ')') {
      if (!indexes.length) throw new Error('Unexpected )');
      result.push(result.splice(indexes.pop()));
    } else result.push(t);
  }
  if (indexes.length) throw new Error(`Missing ${indexes.length} )`);
  return result;
};

const parseLambda = (ast) => {
  if (!Array.isArray(ast)) return ast;
  ast = ast.map(parseLambda);
  if (ast[0] !== 'λ') return ast;

  const dotIndex = ast.indexOf('.');
  return {args: [...ast.slice(1, dotIndex)], body: ast.slice(dotIndex + 1)};
};

export const parseExpr = (str) =>
  parseLambda(nest(str.match(/[λ.()a-z]|\$\w+/g)));
