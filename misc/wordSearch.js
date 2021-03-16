// const {it} = require('./test');

/*

Given a rectangular grid of characters, print the longest string that forms a lexicographically ordered path through the grid.

- Characters are between " " (ascii 32) and "~" (ascii 126) inclusively.
- The rows of the grid are separated by newlines (ascii 10) and should not be interpreted as characters in the grid.
- Paths will not necessarily be sequential (characters can be skipped).
- They can start and end anywhere in the grid.
- They can change directions at any time, go in any direction, diagonally, or even cross themselves.
- If there's a tie for longest, return the path that comes first lexicographically

**Example 1:**
```
mda
xfc
gxx
```
The longest ascending path is `"acdfgx"`


**Example 2:**
```
bja
def
ghi
```
The longest ascending path is `"bdefhi"` (Another solution is `"bdeghi"` but `"bdefhi"` comes first lexicographically)

**Example 3:**
```
/o'xk4^%6N
xZ-(CKd:}N
#LoYiI.o(2
Qu+$oBE[oe
RSr&Y|O'*Q
ypmJ9th[&G
*XKq,{&/Q_
44>S6=6{jR
&)2KgPBlAF
39rG:2ixUV
```
The longest ascending path is `"$&+LQRSmpru"`

Your solution must work on 100 random tests with 10-20 rows/columns and 150 random tests with 50-80 rows/columns within the time limit.


*/

// function longestPath(str) {
//   // your solution!
// }

const dirs = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const longestOrAlpha = (a, b) =>
  a.length > b.length || (a.length === b.length && a < b) ? a : b;

const getLongestAt = (arr, r, c, memo) => {
  if (!memo[r][c]) {
    memo[r][c] =
      arr[r][c] +
      dirs
        .filter(([dr, dc]) => arr[r + dr] && arr[r + dr][c + dc] > arr[r][c])
        .map(([dr, dc]) => getLongestAt(arr, r + dr, c + dc, memo))
        .reduce(longestOrAlpha, '');
  }
  return memo[r][c];
};

const longestPath = (str) => {
  const arr = str.split('\n').map((r) => r.split(''));
  const memo = arr.map(() => []);

  return arr
    .flatMap((row, r) => row.map((_, c) => getLongestAt(arr, r, c, memo)))
    .reduce(longestOrAlpha, '');
};

//////// Tests

// const {expect} = require('chai');

// const myLongestPath = (() => {
//   const dirs = [
//     [1, 0],
//     [1, 1],
//     [0, 1],
//     [-1, 1],
//     [-1, 0],
//     [-1, -1],
//     [0, -1],
//     [1, -1],
//   ];

//   const longestOrAlpha = (a, b) =>
//     a.length > b.length || (a.length === b.length && a < b) ? a : b;

//   const getLongestAt = (arr, r, c, memo) => {
//     if (!memo[r][c]) {
//       memo[r][c] =
//         arr[r][c] +
//         dirs
//           .filter(([dr, dc]) => arr[r + dr] && arr[r + dr][c + dc] > arr[r][c])
//           .map(([dr, dc]) => getLongestAt(arr, r + dr, c + dc, memo))
//           .reduce(longestOrAlpha, '');
//     }
//     return memo[r][c];
//   };

//   return (str) => {
//     const arr = str.split('\n').map((r) => r.split(''));
//     const memo = arr.map(() => []);

//     return arr
//       .flatMap((row, r) => row.map((_, c) => getLongestAt(arr, r, c, memo)))
//       .reduce(longestOrAlpha, '');
//   };
// })();

// it('should work for a small grid', () => {
//   const result = longestPath(
//     `
// mda
// xfc
// gxx

// `.trim()
//   );
//   expect(result).to.equal('acdfgx');
// });

// it('should work for another small grid', () => {
//   const result = longestPath(
//     `
// bja
// def
// ghi

// `.trim()
//   );
//   expect(result).to.equal('bdefhi');
// });

// it('should work for a bigger grid', () => {
//   const result = longestPath(
//     `
// /o'xk4^%6N
// xZ-(CKd:}N
// #LoYiI.o(2
// Qu+$oBE[oe
// RSr&Y|O'*Q
// ypmJ9th[&G
// *XKq,{&/Q_
// 44>S6=6{jR
// &)2KgPBlAF
// 39rG:2ixUV

// `.trim()
//   );
//   expect(result).to.equal('$&+LQRSmpru');
// });

// it('should return empty string on an empty grid', () => {
//   expect(longestPath('')).to.equal('');
// });

// it('should return empty string for a 0x2 grid', () => {
//   expect(longestPath('\n')).to.equal('');
// });

// it('should return empty string for a 0x3 grid', () => {
//   expect(longestPath('\n\n')).to.equal('');
// });

// it('should work on a 2x1 grid', () => {
//   expect(longestPath('ab')).to.equal('ab');
// });

// it('should work on a 1x2 grid', () => {
//   expect(longestPath('a\nb')).to.equal('ab');
// });

// it('should return a path of length 1 for a grid of all the same character', () => {
//   const result = longestPath(
//     `
// zzzz
// zzzz

// `.trim()
//   );
//   expect(result).to.equal('z');
// });

// ///

// [
//   [100, 10, 20],
//   [150, 50, 80],
// ].forEach(([count, min, max]) => {
//   it(`should work on ${count} random tests with ${min}-${max} rows and columns`, () => {
//     for (let i = 0; i < count; i++) {
// const rows = min + Math.floor(Math.random() * (max - min));
// const cols = min + Math.floor(Math.random() * (max - min));
// const input = [...Array(rows)]
//   .map(() =>
//     [...Array(cols)]
//       .map(() =>
//         String.fromCharCode(32 + Math.floor(Math.random() * (126 - 32)))
//       )
//       .join('')
//   )
//   .join('\n');

//       expect(longestPath(input)).to.equal(myLongestPath(input));
//     }
//   });
// });

const randInput = (size) =>
  [...Array(size)]
    .map(() =>
      [...Array(size)]
        .map(() =>
          String.fromCharCode(32 + Math.floor(Math.random() * (126 - 32)))
        )
        .join('')
    )
    .join('\n');

const result = [];
for (let size = 0; size < 64; size++) {
  let time = 0;
  for (let i = 0; i < 1000; i++) {
    const input = randInput(size);
    const start = process.hrtime();
    longestPath(input);
    const end = process.hrtime(start);
    time += end[0] * 1000 + end[1] / 1e6;
  }

  console.log(Math.round(time));
  result.push(Math.round(time));
}

console.log(result);
