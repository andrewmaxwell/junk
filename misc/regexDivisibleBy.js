let counter = 2;
const exprs = {0: 0, 1: 1};

const trieToString = (trie) => {
  const entries = Object.entries(trie);
  const val = entries
    .map(([key, val]) => {
      const v = trieToString(val);
      return key + (v ? ' ' + v : '');
    })
    .join(' | ');
  return entries.length > 1 ? `(${val})` : val;
};

const trie = (args) => {
  const ob = {};
  for (const arg of args) {
    let ct = ob;
    for (const el of arg) {
      if (ct[el] === undefined) ct[el] = {};
      ct = ct[el];
    }
  }
  return trieToString(ob);
};

const makeOp = (op, args, repeating = '') => {
  args = args.filter((i) => i !== undefined);
  if (!args.length) return;
  if (args.length === 1) return args[0] + repeating;

  exprs[counter++] =
    op === 'or'
      ? trie(args.map((a) => String(exprs[a]).split(' '))) + repeating
      : repeating
      ? `(${args.join(' ')})*`
      : args.join(' ');
  return counter - 1;
};

const eliminate = (s, dfa) => {
  const result = dfa.filter((d) => d.to !== s && d.from !== s);

  const loops = makeOp(
    'or',
    dfa.filter((d) => d.to === s && d.from === s).map((d) => d.consume),
    '*'
  );

  for (const a of dfa) {
    if (a.to !== s || a.from === s) continue;
    for (const b of dfa) {
      if (b.from !== s || b.to === s) continue;
      result.push({
        from: a.from,
        to: b.to,
        consume: makeOp('concat', [a.consume, loops, b.consume]),
      });
    }
  }
  // console.log('>>>', s, result);
  return result;
};

const regexDivisibleBy = (n) => {
  let dfa = [
    {from: 'start', to: 0},
    {from: 0, to: 'end'},
  ];

  for (let i = 0; i < n; i++) {
    dfa.push(
      {from: i, to: (i * 2) % n, consume: 0},
      {from: i, to: (i * 2 + 1) % n, consume: 1}
    );
  }

  for (let i = n - 1; i >= 0; i--) {
    dfa = eliminate(i, dfa);
  }

  const lastId = makeOp(
    'or',
    dfa.map((d) => d.consume)
  );

  // console.log(exprs);

  let result = exprs[lastId];

  for (let i = 0; i < 7; i++) {
    result = result.replace(/\d+/g, (n) => (n < 2 ? n : `(${exprs[n]})`));
  }
  result = result.replace(/\s/g, '');
  return `^${result}$`;
};

const {Test} = require('./test');
for (let i = 1; i < 10; i++) {
  const r = new RegExp(regexDivisibleBy(i));
  console.log(r.toString());
  for (let j = 0; j < 1000; j++) {
    Test.assertDeepEquals(r.test(j.toString(2)), j % i === 0, `${j} % ${i}`);
  }
}

// console.log(regexDivisibleBy(18).length.toLocaleString());
// console.dir(regexDivisibleBy(12), {depth: Infinity});
