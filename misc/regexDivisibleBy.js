const treeMap = (func, ob) => {
  if (!ob || typeof ob !== 'object') return func(ob);
  const res = Array.isArray(ob) ? [] : {};
  for (const key in ob) res[key] = treeMap(func, ob[key]);
  return func(res);
};

const groupByIndex = (prop, arr) => {
  const groups = {};
  for (const el of arr) {
    const key = JSON.stringify(el[prop]);
    (groups[key] = groups[key] || []).push(el);
  }
  return Object.values(groups);
};

const allEqual = ([first, ...rest]) => {
  first = JSON.stringify(first);
  return rest.every((a) => JSON.stringify(a) === first);
};

const simplifyGroup = (gr) => {
  const firstGroups = groupByIndex(1, gr);
  const thirdGroups = groupByIndex(3, gr);
  return allEqual(thirdGroups.map((g) => g.map((g) => g[1])))
    ? [
        [
          'cat',
          ['or', ...firstGroups.map((g) => g[0][1])],
          gr[0][2],
          ['or', ...thirdGroups.map((g) => g[0][3])],
        ],
      ]
    : firstGroups.length < thirdGroups.length
    ? firstGroups.map((g) => [
        'cat',
        g[0][1],
        g[0][2],
        ['or', ...g.map((g) => g[3])],
      ])
    : thirdGroups.map((g) => [
        'cat',
        ['or', ...g.map((g) => g[1])],
        g[0][2],
        g[0][3],
      ]);
};

const simplifyOrCat = (ob) =>
  ob[0] === 'or'
    ? [
        ...ob.filter((a) => a[0] !== 'cat' || a.length !== 4),
        ...groupByIndex(
          2,
          ob.filter((a) => a[0] === 'cat' && a.length === 4)
        ).flatMap(simplifyGroup),
      ]
    : ob;

const simplifyArgs = (ob) => {
  if (!Array.isArray(ob)) return ob;
  const [op, ...args] = ob;
  const newArgs = args
    .map(simplifyArgs)
    .filter((a) => a !== undefined)
    .flatMap((a) => (a[0] === op ? a.slice(1) : [a]));
  return op !== '*' && newArgs.length < 2 ? newArgs[0] : [op, ...newArgs];
};

const simplify = (ob) => simplifyArgs(treeMap(simplifyOrCat, ob));

const withParens = (args) => {
  if (args.length < 2) return args;
  let depth = 0;
  for (const t of args) {
    if (t === '(') depth++;
    else if (t === ')') depth--;
    else if (!depth) return `(${args})`;
  }
  return args;
};

const exprToStr = (expr) => {
  if (!Array.isArray(expr)) return expr;
  let [op, ...args] = expr;
  args = args.map(exprToStr);

  if (op === '*') return withParens(String(args[0])) + '*';
  if (op === 'cat') return args.join('');
  return withParens(args.join('|'));
};

const makeOp = (op, args) => {
  args = args.filter((el) => el !== undefined);
  if (!args.length) return;
  if (args.length === 1) return args[0];
  return [op, ...args];
};

const eliminate = (s, dfa) => {
  const result = dfa.filter((d) => d.to !== s && d.from !== s);

  let loops = makeOp(
    'or',
    dfa.filter((d) => d.to === s && d.from === s).map((d) => d.consume)
  );
  if (loops) loops = ['*', loops];

  for (const a of dfa) {
    if (a.to !== s || a.from === s) continue;
    for (const b of dfa) {
      if (b.from !== s || b.to === s) continue;
      result.push({
        from: a.from,
        to: b.to,
        consume: makeOp('cat', [a.consume, loops, b.consume]),
      });
    }
  }
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

  // console.dir(dfa[0].consume, {depth: Infinity});
  // console.dir(simplify(dfa[0].consume), {depth: Infinity});
  return `^${exprToStr(simplify(dfa[0].consume))}$`;
};

import {Test} from './test.js';
const i = 12;
const r = new RegExp(regexDivisibleBy(i));
// for (let j = 0; j < 1000; j++) {
//   Test.assertDeepEquals(r.test(j.toString(2)), j % i === 0, `${j} % ${i}`);
// }
console.log(r);

// for (let i = 0; i < 8; i++) {
//   const r = new RegExp(regexDivisibleBy(i));
//   for (let j = 0; j < 10; j++) {
//     Test.assertDeepEquals(r.test(j.toString(2)), j % i === 0, `${j} % ${i}`);
//   }
// }
