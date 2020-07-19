const parse = (str) =>
  str
    .match(/[</>]|\s+|"[^"]*"|[a-z0-9-.]+/gi)
    .filter((t) => t.trim())
    .reduce(
      ({res, t}, s) => {
        if (s === '<') t = [];
        else if (s === '>') {
          res.push(t);
          t = null;
        } else if (t) t.push(s);
        else res.push(s);
        return {res, t};
      },
      {res: []}
    )
    .res.map((t) => {
      if (t[0] === '/') return {tag: t[1], close: true};
      const res = {tag: t[0]};
      if (t[t.length - 1] === '/') {
        t.pop();
        res.selfClosing = true;
      }
      for (let i = 1; i < t.length; i += 2)
        res[t[i]] = t[i + 1].replace(/^"|"$/g, '');
      return res;
    })
    .reduce(
      (stack, t) => {
        if (t.close) stack.pop();
        else if (!t.selfClosing) {
          t.children = [];
          stack[stack.length - 1].children.push(t);
          stack.push(t);
        } else stack[stack.length - 1].children.push(t);

        return stack;
      },
      [{children: []}]
    )[0].children;

const toJS = (() => {
  const methods = [
    'map',
    'filter',
    'some',
    'every',
    'reduce',
    'concat',
    'slice',
    'join',
    'split',
    'sort',
    'reverse',
    'repeat',
    'getDay',
    'getDate',
    'getFullYear',
  ];
  const operators = {
    and: '&&',
    or: '||',
    add: '+',
    subtract: '-',
    multiply: '*',
    divide: '/',
    modulo: '%',
    exponent: '**',
    equals: '===',
    gt: '>',
    lt: '<',
    gte: '>=',
    lte: '<=',
  };
  const mapping = {
    number: ({value}) => Number(value),
    lambda: ({name = 'a', children}) => {
      if (children.length === 1) return `(...${name}) => ${toJS(children[0])}`;

      const ch = children.map(toJS);
      return (
        `(...${name}) => {` +
        `\n${ch.slice(0, -1).join(';\n')};\nreturn ${
          ch[ch.length - 1]
        }\n`.replace(/\n/g, '\n  ') +
        '}'
      );
    },
    argument: ({lambda = 'a', index}) => `${lambda}[${index}]`,
    string: ({value}) => `"${value}"`,
    define: ({name, children}) => `const ${name} = ${toJS(children[0])}`,
    array: ({children = []}) => `[${children.map(toJS).join(', ')}]`,
    ...methods.reduce((res, n) => {
      (res[n] = ({children: [a, ...r]}) =>
        `${toJS(a)}.${n}(${r.map(toJS).join(', ')})`),
        res;
      return res;
    }, {}),
    ...Object.entries(operators).reduce((res, [n, o]) => {
      res[n] = ({children}) =>
        '(' + children.map(toJS).join(' ' + o + ' ') + ')';
      return res;
    }, {}),
    not: ({children: [a]}) => `!(${toJS(a)})`,
    ifElse: ({children: [a, b, c]}) => `(${toJS(a)} ? ${toJS(b)} : ${toJS(c)})`,
    range: ({children: [s, e]}) =>
      `[...new Array(${toJS(e)} - ${toJS(s)})].map((v, i) => ${toJS(s)} + i)`,
    property: ({children, name}) =>
      name
        ? `${toJS(children[0])}.${name}`
        : `${toJS(children[0])}[${toJS(children[1])}]`,
    reference: ({name}) => name,
    date: ({children = []}) => `new Date(${children.map(toJS).join(', ')})`,
  };

  return (ob) =>
    mapping[ob.tag]
      ? mapping[ob.tag](ob)
      : ob.tag + '(' + (ob.children || []).map(toJS).join(', ') + ')';
})();

// UI SETUP
document.querySelectorAll('script').forEach((s) => {
  if (!s.id) return;
  document.querySelector('#examples').innerHTML += `
  <h2>${s.id}</h2>
  <div class="row">
    <div class="col-sm-6">
      <h6>Source</h6>
      <textarea>${s.innerHTML.replace(/\n {4}/g, '\n')}</textarea>
    </div>
    <div class="col-sm-6">
      <h6>Transpiled to JS</h6>
      <pre style="white-space: pre-wrap"><code class="javascript"></code></pre>
      <h6>Evaluated Result</h6>
      <pre class="result" style="white-space: pre-wrap; background: #eee; padding: 8px"></pre>
    </div>
  </div>`;
});

const evaluate = (str) => {
  try {
    return eval(str);
  } catch (e) {
    return e.stack;
  }
};
const update = ({parentElement, value}) => {
  const p = parentElement.parentElement;
  const js = parse(value).map(toJS).join(';\n');
  p.querySelector('.javascript').innerHTML = js;
  p.querySelector('.result').innerHTML = evaluate(js);
};
document.querySelectorAll('textarea').forEach(update);
window.addEventListener('input', (e) => update(e.target));
