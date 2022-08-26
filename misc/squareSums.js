function square_sums_row(n) {
  console.log(n);
  if (n < 15) return false;

  const edges = {};
  for (let i = 1; i <= n; i++) {
    edges[i] = [];
    for (let root = 2; ; root++) {
      const v = root * root - i;
      if (v > n) break;
      if (v > 0 && v !== i) edges[i].push(v);
    }
  }

  const noEdges = Object.values(edges).some((e) => e.length === 0);
  if (noEdges) return false;

  const deadEnds = Object.values(edges).filter((e) => e.length === 1);
  if (deadEnds.length > 2) return false;

  // start at the point with the fewest connections
  const start = Object.entries(edges).reduce(
    (s, [v, e]) => (e.length < edges[s].length ? +v : s),
    1
  );

  const q = [[start]];
  while (q.length) {
    const current = q.pop();
    if (current.length === n) return current;
    for (const n of edges[current[current.length - 1]]) {
      if (!current.includes(n)) {
        q.push([...current, n]);
      }
    }
  }

  return false;
}

for (let i = 100; i < 110; i++) console.log(square_sums_row(i).join?.(','));

// import {Test, it} from './test.js';
// function verify(n, r) {
//   console.log(r);
//   if (!Array.isArray(r)) {
//     Test.expect(false, 'Not an array');
//     return;
//   }
//   let act_sorted = JSON.stringify(r.slice(0).sort((a, b) => a - b));
//   let exp_sorted = JSON.stringify(
//     Array(n)
//       .fill(0)
//       .map((a, i) => i + 1)
//   );
//   Test.assertEquals(act_sorted, exp_sorted);
//   if (act_sorted !== exp_sorted) {
//     return;
//   }
//   for (let i = 1; i < n; ++i) {
//     let sum = r[i - 1] + r[i];
//     let not_sq = 0 !== Math.sqrt(sum) % 1;
//     if (not_sq) {
//       Test.expect(
//         false,
//         `Pair sum is not a square: ${r[i - 1]}+${r[i]}=${sum}`
//       );
//     }
//   }
// }

// function check(n) {
//   return verify(n, square_sums_row(n));
// }

// it('Basic test', function () {
//   check(15);
//   check(23);
//   check(25);
// });

// it('No solution', function () {
//   Test.assertEquals(square_sums_row(2), false);
//   Test.assertEquals(square_sums_row(5), false);
//   Test.assertEquals(square_sums_row(14), false);
// });

// check(28);

// not tested. Uncomment for extra challenge, and to prepare for harder Kata.
//it('Harder test', function() {
//  check(50)
//})
