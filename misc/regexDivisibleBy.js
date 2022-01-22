let counter = 2;
const exprs = {0: 0, 1: 1};

const makeOp = (op, args, repeating = '') => {
  args = args.filter((i) => i !== undefined);
  if (!args.length) return;
  if (args.length === 1 && !repeating) return args[0];

  // exprs[counter] = {op, args};
  // if (repeating) exprs[counter].repeating = true;
  exprs[counter] =
    op === 'concat'
      ? args
      : args.length === 1
      ? args[0] + '*'
      : args.map((v) => exprs[v]);
  return counter++;
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

// const makeTrie = (args) => {
//   const trie = {};

//   console.log('args', args);
//   for (const el of args.map(expand)) {
//     let c = trie;
//     for (const v of el.args || [el]) {
//       c = c[v] = c[v] || {};
//     }
//   }
//   return trie;
// };

// const expand = (id) => {
//   const result = exprs[id];
//   if (result === undefined) return id;
//   if (result.op === 'or') return makeTrie(result.args);
//   return result;
// };

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

  console.log(exprs);

  console.log(dfa);

  // console.dir(expand(dfa[0].consume), {depth: Infinity});

  // const lastId = makeOp(
  //   'or',
  //   dfa.map((d) => d.consume)
  // );

  // let result = exprs[lastId];

  // for (let i = 0; i < 7; i++) {
  //   result = result.replace(/\d+/g, (n) => (n < 2 ? n : `(${exprs[n]})`));
  // }
  // result = result.replace(/\s/g, '');
  // return `^${result}$`;
};

// const {Test} = require('./test');
// for (let i = 1; i < 10; i++) {
//   const r = new RegExp(regexDivisibleBy(i));
//   console.log(r.toString());
//   for (let j = 0; j < 1000; j++) {
//     Test.assertDeepEquals(r.test(j.toString(2)), j % i === 0, `${j} % ${i}`);
//   }
// }

// console.log(regexDivisibleBy(18).length.toLocaleString());
// console.dir(regexDivisibleBy(12), {depth: Infinity});

regexDivisibleBy(8);

// const groupByIndex = (prop, arr) => {
//   const groups = {};
//   for (const el of arr) {
//     (groups[el[prop]] = groups[el[prop]] || []).push(el);
//   }
//   return Object.values(groups);
// };

// const allEqual = (arrs) => {
//   if (arrs.length < 2) return true;
//   for (let i = 1; i < arrs.length; i++) {
//     if (arrs[i].length !== arrs[0].length) return false;
//     for (let j = 0; j < arrs[0].length; j++) {
//       if (arrs[0][j] !== arrs[i][j]) return false;
//     }
//   }
//   return true;
// };

// const simplifyOrCat = (args) => [
//   'or',
//   ...args.filter((a) => a[0] !== 'cat' || a.length !== 4),
//   ...groupByIndex(
//     2,
//     args.filter((a) => a[0] === 'cat' && a.length === 4)
//   ).map((gr) => {
//     const firstGroups = groupByIndex(1, gr);
//     const thirdGroups = groupByIndex(3, gr);

//     return [
//       'or',
//       ...(firstGroups.length < thirdGroups.length
//         ? firstGroups.map((g) => [
//             'cat',
//             g[0][1],
//             g[0][2],
//             ['or', ...g.map((g) => g[3])],
//           ])
//         : allEqual(thirdGroups.map((g) => g.map((g) => g[1])))
//         ? [
//             [
//               'cat',
//               ['or', ...firstGroups.map((g) => g[0][1])],
//               gr[0][2],
//               ['or', ...thirdGroups.map((g) => g[0][3])],
//             ],
//           ]
//         : thirdGroups.map((g) => [
//             'cat',
//             ['or', ...g.map((g) => g[1])],
//             g[0][2],
//             g[0][3],
//           ])),
//     ];
//   }),
// ];

// const simplify = (ob) => {
//   if (!Array.isArray(ob)) return ob;
//   const [op, ...args] = ob;
//   const newArgs = args
//     .map(simplify)
//     .filter((a) => a !== undefined)
//     .flatMap((a) => (a[0] === op ? a.slice(1) : [a]));
//   if (newArgs.length < 2) return newArgs[0];

//   if (
//     op === 'or' &&
//     newArgs.every((a) => Array.isArray(a) && a.every((v) => !Array.isArray(v)))
//   ) {
//     return simplify(simplifyOrCat(newArgs));
//   }

//   return [op, ...newArgs];
// };

// const {Test} = require('./test');
// Test.assertDeepEquals(
//   simplify([
//     'or',
//     ['cat', 1, 20, 17],
//     ['cat', 1, 20, 19],
//     ['cat', 0, 33, 15],
//     ['cat', 0, 33, 30],
//     ['cat', 0, 33, 32],
//   ]),
//   ['or', ['cat', 1, 20, ['or', 17, 19]], ['cat', 0, 33, ['or', 15, 30, 32]]]
// );

// Test.assertDeepEquals(
//   simplify(['or', ['cat', 17, 1, 20], ['cat', 19, 1, 20]]),
//   ['cat', ['or', 17, 19], 1, 20]
// );

// Test.assertDeepEquals(
//   simplify([
//     'or',
//     ['cat', 1, 20, 17],
//     ['cat', 1, 20, 19],
//     ['cat', 0, 33, 15],
//     ['cat', 0, 33, 30],
//     ['cat', 0, 33, 32],
//     ['cat', 21, 33, 15],
//     ['cat', 21, 33, 30],
//     ['cat', 21, 33, 32],
//     ['cat', 22, 33, 15],
//     ['cat', 22, 33, 30],
//     ['cat', 22, 33, 32],
//   ]),
//   [
//     'or',
//     ['cat', 1, 20, ['or', 17, 19]],
//     ['cat', ['or', 0, 21, 22], 33, ['or', 15, 30, 32]],
//   ]
// );
