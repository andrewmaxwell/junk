const precedence = {'=': 1, '|': 2, '&': 3, '~': 4};

// takes a logic expression string and parses it into a tree structure
const parse = (str) => {
  if (str.length < 2) return str;

  let index = 0;
  let level = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '(') level++;
    else if (c === ')') level--;
    else if (!level && (precedence[c] || 10) < (precedence[str[index]] || 10))
      index = i;
  }
  return !index && str[0] === '('
    ? parse(str.slice(1, -1))
    : {
        op: str[index],
        left: parse(str.slice(0, index)),
        right: parse(str.slice(index + 1)),
      };
};

// takes a tree or part of a tree and returns the variables in it
const getVars = (node) =>
  node && typeof node === 'object'
    ? [...new Set(Object.values(node).flatMap(getVars))].sort() // uniq and sort
    : /[ABCDEGHIJKLMNOPQRSUVWXYZ]/i.test(node)
    ? [node]
    : [];

// takes a tree or part of a tree and a mapping of values for variables and returns if it evaluates to true or false
const evaluate = (node, values) => {
  const {op, left, right} = node;
  switch (op) {
    case '=':
      return evaluate(left, values) === evaluate(right, values);
    case '&':
      return evaluate(left, values) && evaluate(right, values);
    case '|':
      return evaluate(left, values) || evaluate(right, values);
    case '~':
      return !evaluate(right, values);
    default:
      return node === 'T' ? true : node === 'F' ? false : values[node];
  }
};

// takes a tree and returns an html string representing the table
const makeTruthTable = (tree) => {
  const vars = getVars(tree);
  const rows = [];
  for (let i = 0; i < 2 ** vars.length; i++) {
    const values = {};

    let n = i;
    for (const v of vars) {
      values[v] = n % 2 === 1;
      n = Math.floor(n / 2);
    }

    rows[i] = `<tr>
      ${vars.map((v) => `<td>${values[v]}</td>`).join('')}
      <td>${evaluate(tree, values)}</td>
    </tr>`;
  }
  return `<thead>
    <tr>
      ${vars.map((v) => `<th>${v}</th>`).join('')}
      <th>Output</th>
    </tr>
  </thead>
  <tbody>${rows.join('')}</tbody>`;
};

const onChange = () => {
  const expressionString = document.querySelector('input').value;
  document.querySelector('table').innerHTML = makeTruthTable(
    parse(expressionString)
  );
};
document.querySelector('input').addEventListener('input', onChange);
onChange();
