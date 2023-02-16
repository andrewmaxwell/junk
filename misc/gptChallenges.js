import {Test} from './test.js';

const sorty = (arr) =>
  Object.entries(
    arr.reduce((counts, x) => {
      counts[x] = (counts[x] || 0) + 1;
      return counts;
    }, {})
  )
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .flatMap(([n, count]) => Array(count).fill(+n));

// function sortByFrequency(arr) {
//   const counts = arr.reduce((acc, val) => {
//     acc[val] = (acc[val] || 0) + 1;
//     return acc;
//   }, {});

//   return arr.sort((a, b) => {
//     if (counts[b] !== counts[a]) {
//       return counts[b] - counts[a];
//     } else {
//       return b - a;
//     }
//   });
// }

Test.assertDeepEquals(
  sorty([3, 3, 1, 1, 1, 2, 2, 2, 2, 4, 4]),
  [2, 2, 2, 2, 1, 1, 1, 4, 4, 3, 3]
);

/////

const isAnagram = (a, b) =>
  [...a.toLowerCase()].sort().join('') === [...b.toLowerCase()].sort().join('');

Test.assertDeepEquals(isAnagram('hello', 'llohe'), true);
Test.assertDeepEquals(isAnagram('world', 'word'), false);
Test.assertDeepEquals(isAnagram('Listen', 'silent'), true);

/////

const longestIncreasingSubsequenceLength = (arr) => {
  const piles = [];
  for (const num of arr) {
    const pile = piles.find((pile) => pile[pile.length - 1] >= num);
    if (pile) pile.push(num);
    else piles.push([num]);
  }
  return piles.length;
};

const input = [10, 9, 2, 5, 3, 7, 101, 18];
const output = longestIncreasingSubsequenceLength(input);

Test.assertDeepEquals(output, 4);
