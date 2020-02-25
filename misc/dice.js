// const sum = arr => {
//   let result = 0;
//   for (const v of arr) result += v;
//   return result;
// };

// const getCombos = (dice, sides) =>
//   dice
//     ? getCombos(dice - 1, sides).reduce((res, c) => {
//         for (let i = 0; i < sides; i++) res.push(c.concat(i + 1));
//         return res;
//       }, [])
//     : [[]];

// const rollDice = (dice, sides, threshold) => {
//   const combos = getCombos(dice, sides);
//   return combos.filter(c => sum(c) >= threshold).length / sides ** dice;
// };

// const rollDice = (dice, sides, threshold) => {
//   threshold = sides - threshold + 1; // d6 >=2 === <5
//   const q = [[]];
//   for (let i = 0; i < q.length; i++) {
//     if (q[i].length === dice) break;
//     for (let j = 1; j <= sides; j++) {
//       q.push([...q[i], j]);
//     }
//   }
//   return combos.filter(c => sum(c) >= threshold).length / sides ** dice;
// };

// const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// const groupBy = (func, arr) =>
//   arr.reduce((groups, el) => {
//     const key = func(el);
//     (groups[key] = groups[key] || []).push(el);
//     return groups;
//   }, {});

// for (let dice = 2; dice <= 4; dice++) {
//   for (let sides = 2; sides <= 5; sides++) {
//     console.log(`\n\n${dice} dice with ${sides} sides`);
//     console.log(
//       Object.entries(groupBy(sum, getCombos(dice, sides)))
//         .map(
//           ([total, combos]) =>
//             // const div = gcd(combos.length, sides ** dice);
//             `${String(total).padStart(2)} ${'*'.repeat(combos.length)} ${
//               combos.length
//             }`
//         )
//         .join('\n')
//     );
//   }
// }

// const rollDice = (dice, sides, threshold) => {
//   console.log(dice, sides, threshold);
//   const lt = dice * (sides + 1) - threshold + 1;
//   const numDice = [0];
//   const totals = [0];
//   let num = 0;
//   for (let i = 0; i < numDice.length; i++) {
//     const d = numDice[i];
//     const t = totals[i];
//     if (d < dice) {
//       for (let j = 1; j <= sides && j < lt - t; j++) {
//         numDice.push(d + 1);
//         totals.push(t + j);
//       }
//     } else num++;
//   }
//   return num / sides ** dice;
// };

var cache = [[1], [1, 1]];

function C(k, n) {
  if (k < 0) return 0;
  if (!cache[n]) {
    cache[n] = [1];
    cache[n][n] = 1;
  }
  if (!cache[n][k]) {
    cache[n][k] = C(k - 1, n - 1) + C(k, n - 1);
  }
  return cache[n][k];
}

function rollDice(rolls, sides, threshold) {
  if (threshold < rolls) return 1;
  if (threshold > rolls * sides) return 0;

  threshold -= rolls + 1;
  let sum = 0;
  for (let i = 0; threshold >= 0; i++) {
    sum += (i % 2 ? -1 : 1) * C(i, rolls) * C(threshold, threshold + rolls);
    threshold -= sides;
  }
  return 1 - sum / Math.pow(sides, rolls);
}

[
  [1, 6, 4, 0.5],
  [1, 20, 20, 0.05],
  [2, 4, 2, 1],
  [2, 4, 9, 0],
  [2, 6, 3, 35 / 36],
  [2, 6, 4, 11 / 12]
  // [20, 100, 199, 0.5]
].forEach(([d, s, t, x]) => {
  const actual = rollDice(d, s, t);
  if (Math.abs(actual - x) > 1e-4) {
    console.error(`Expected ${x}, got ${actual}`);
  } else {
    console.log('PASS');
  }
});

// console.log(rollDice(6, 1029, 1035));
// console.log(rollDice(2, 6, 3));
// console.log(cache);
// console.log(cache);
