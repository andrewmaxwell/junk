const {Render, GetData, React, ReactDOM} = window;
const {useEffect, useState} = React;
const {pipe, assocPath, equals} = window.R;

/* eslint-disable no-use-before-define */
const infixToString = op => expr => expr.args.map(toStr).join(op);
const functionToString = funcName => expr =>
  `${funcName}(${expr.args.map(toStr).join(', ')})`;
const evaluate = (expr = {}, item) =>
  ops[expr.type] && ops[expr.type].eval(expr, item);
/* eslint-enable no-use-before-define */

const ops = {
  field: {
    toString: expr => expr.value,
    eval: ({value}, item) => item && item[value],
    input: (props, allColumns) => (
      <select {...props}>
        <option />
        {allColumns.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  },
  number: {
    toString: expr => expr.value,
    eval: ({value}) => +value,
    input: props => <input type="number" {...props} />
  },
  string: {
    toString: expr => `"${expr.value}"`,
    eval: ({value}) => value,
    input: props => <input type="text" {...props} />
  },
  boolean: {
    toString: expr => expr.value,
    eval: ({value}) => Boolean(value),
    input: props => (
      <select {...props}>
        <option>false</option>
        <option value={1}>true</option>
      </select>
    )
  },
  list: {
    toString: functionToString(''),
    eval: ({args}, item) => args.map(c => evaluate(c, item)),
    minArgs: 1,
    maxArgs: Infinity
  },
  AND: {
    toString: infixToString(' AND '),
    eval: ({args}, item) => args.every(c => evaluate(c, item)),
    minArgs: 2,
    maxArgs: Infinity
  },
  OR: {
    toString: infixToString(' OR '),
    eval: ({args}, item) => args.some(c => evaluate(c, item)),
    minArgs: 2,
    maxArgs: Infinity
  },
  IN: {
    toString: infixToString(' IN '),
    eval: ({args: [needle, haystack]}, item) => {
      const h = evaluate(haystack, item);
      return h && h.includes && h.includes(evaluate(needle, item));
    },
    minArgs: 2,
    maxArgs: 2
  },
  'NOT IN': {
    toString: infixToString(' NOT IN '),
    eval: ({args: [needle, haystack]}, item) => {
      const h = evaluate(haystack, item);
      return !h || !h.includes || !h.includes(evaluate(needle, item));
    },
    minArgs: 2,
    maxArgs: 2
  },
  '=': {
    toString: infixToString(' = '),
    eval: ({args: [a, b]}, item) =>
      equals(evaluate(a, item), evaluate(b, item)),
    minArgs: 2,
    maxArgs: 2
  },
  '!=': {
    toString: infixToString(' != '),
    eval: ({args: [a, b]}, item) =>
      !equals(evaluate(a, item), evaluate(b, item)),
    minArgs: 2,
    maxArgs: 2
  },
  '>': {
    toString: infixToString(' > '),
    eval: ({args: [a, b]}, item) => evaluate(a, item) > evaluate(b, item),
    minArgs: 2,
    maxArgs: 2
  },
  '>=': {
    toString: infixToString(' >= '),
    eval: ({args: [a, b]}, item) => evaluate(a, item) >= evaluate(b, item),
    minArgs: 2,
    maxArgs: 2
  },
  '<': {
    toString: infixToString(' < '),
    eval: ({args: [a, b]}, item) => evaluate(a, item) < evaluate(b, item),
    minArgs: 2,
    maxArgs: 2
  },
  '<=': {
    toString: infixToString(' <= '),
    eval: ({args: [a, b]}, item) => evaluate(a, item) <= evaluate(b, item),
    minArgs: 2,
    maxArgs: 2
  },
  UPPERCASE: {
    toString: functionToString('UPPERCASE'),
    eval: ({args: [x]}, item) => String(evaluate(x, item)).toUpperCase(),
    minArgs: 1,
    maxArgs: 1
  },
  LOWERCASE: {
    toString: functionToString('LOWERCASE'),
    eval: ({args: [x]}, item) => String(evaluate(x, item)).toLowerCase(),
    minArgs: 1,
    maxArgs: 1
  },
  'STARTS WITH': {
    toString: infixToString(' STARTSWITH '),
    eval: ({args: [a, b]}, item) =>
      String(evaluate(a, item)).startsWith(evaluate(b, item)),
    minArgs: 2,
    maxArgs: 2
  },
  'ENDS WITH': {
    toString: infixToString(' ENDSWITH '),
    eval: ({args: [a, b]}, item) =>
      String(evaluate(a, item)).endsWith(evaluate(b, item)),
    minArgs: 2,
    maxArgs: 2
  },
  DATE: {
    toString: functionToString('DATE'),
    eval: ({args: [x]}, item) => new Date(evaluate(x, item)),
    minArgs: 1,
    maxArgs: 1
  },
  LENGTH: {
    toString: functionToString('LENGTH'),
    eval: ({args: [x]}, item) => evaluate(x, item).length,
    minArgs: 1,
    maxArgs: 1
  }
  // HAS: {
  //   toString: infixToString(' HAS '),
  //   eval: ({args: [a, b]}, item) =>
  //   minArgs: 2,
  //   maxArgs: 2
  // }
};

const toStr = expr =>
  ops[expr.type] ? ops[expr.type].toString(expr) : JSON.stringify(expr);

const normalize = expr => {
  const {minArgs, maxArgs} = ops[expr.type] || {};
  if (maxArgs) {
    const args = (expr.args || []).slice(0, maxArgs);
    while (args.length < minArgs) args.push({});
    return {type: expr.type, args: args.map(normalize)};
  }
  return expr.type ? {type: expr.type, value: expr.value || ''} : expr;
};

const Main = () => {
  const [data, setData] = useState();
  const [expr, setExpr] = useState({});
  const [shownColumns, setShownColumns] = useState(['year', 'id', 'scopes']);

  useEffect(() => {
    try {
      const [expr, shownColumns] = JSON.parse(
        decodeURI(location.hash.slice(1))
      );
      setExpr(normalize(expr));
      setShownColumns(shownColumns);
    } catch (e) {
      /* ignore */
    }
    GetData().then(setData);
  }, []);

  useEffect(() => {
    location.hash = JSON.stringify([expr, shownColumns]);
  });

  return (
    <Render
      data={data}
      expr={expr}
      ops={ops}
      stringifyExpr={toStr}
      evaluate={evaluate}
      onChange={(path, value) => {
        console.log('changed', path, value);
        pipe(assocPath(path, value), normalize, setExpr)(expr);
      }}
      shownColumns={shownColumns}
      setShownColumns={setShownColumns}
    />
  );
};

ReactDOM.render(<Main />, document.getElementById('root'));
