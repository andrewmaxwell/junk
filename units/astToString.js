const unitsToStr = (units = {}) =>
  Object.entries(units)
    .sort((a, b) => b[1] - a[1])
    .map(([key, val]) =>
      val
        ? (val < 0 ? '/' : '⋅') +
          key +
          (Math.abs(val) === 1 ? '' : Math.abs(val))
        : ''
    )
    .join('')
    .replace(/^⋅/, '');

export const astToString = (ast) =>
  ast
    ? (ast.op === 'val'
        ? `${ast.left.toLocaleString()} ${unitsToStr(ast.right)}`
        : `${astToString(ast.left)} ${ast.op} ${astToString(ast.right)}`
      ).trim()
    : ast;
