// const colors = ['#F0`0', '#0F0', '#00F'];
// const canvas = window.canvas;
// const ctx = canvas.getContext('2d');
// const height = innerHeight - 40;

// window.input.oninput = () => {
//   const vals = window.input.value.split('').map((c) => 'RGB'.indexOf(c));

//   canvas.width = height;
//   canvas.height = height;
//   ctx.lineWidth = 0.25;
//   const size = height / vals.length;
//   for (let i = 0; i < vals.length; i++) {
//     for (let j = 0; j < vals.length - i; j++) {
//       const x = size * (j - vals.length / 2 + i / 2) + height / 2;
//       const y = size * i;
//       ctx.fillStyle = colors[vals[j]];
//       ctx.fillRect(x, y, size, size);
//       ctx.strokeRect(x, y, size, size);

//       if (vals[j] !== vals[j + 1]) {
//         vals[j] = 3 - vals[j] - vals[j + 1];
//       }
//     }
//   }
// };
// window.input.value = [...Array(64)]
//   .map(() => 'RGB'[Math.floor(Math.random() * 3)])
//   .join('');
// window.input.oninput();`

// const triangle = (row) =>
//   row.length === 1
//     ? row
//     : triangle(
//         row
//           .split('')
//           .slice(0, -1)
//           .map((v, i) =>
//             v === row[i + 1]
//               ? v
//               : String.fromCharCode(
//                   219 - v.charCodeAt(0) - row.charCodeAt(i + 1)
//                 )
//           )
//           .join('')
//       );

// const cache = {
//   R: 'R',
//   G: 'G',
//   B: 'B',
//   RR: 'R',
//   RG: 'B',
//   RB: 'G',
//   GR: 'B',
//   GG: 'G',
//   GB: 'R',
//   BR: 'G',
//   BG: 'R',
//   BB: 'B',
// };
// const triangle = (input) =>
//   (cache[input] =
//     cache[input] ||
//     cache[triangle(input.slice(0, -1)) + triangle(input.slice(1))]);

// const triangle = (input) => {
//   const vals = input.split('').map(c => 'RGB'.indexOf(c));
//   for (let i = 0; i < vals.length - 1; i++) {
//     for (let j = 0; j < vals.length - i; j++) {
//       if (vals[j] !== vals[j + 1]) {
//         vals[j] = 3 - vals[j] - vals[j + 1];
//       }
//     }
//   }
//   return 'RGB'[vals[0]];
// }

// const memoize = (func) => {
//   const memo = {};
//   return (input) => {
//     if (!memo[input]) memo[input] = func(input);
//     return memo[input];
//   };
// };
// const triangle = memoize((input) => {
//   switch (input.length) {
//     case 1:
//       return input;
//     case 2:
//       return input[0] === input[1]
//         ? input[0]
//         : String.fromCharCode(219 - input.charCodeAt(0) - input.charCodeAt(1));
//     default:
//       return triangle(triangle(input.slice(0, -1)) + triangle(input.slice(1)));
//   }
// });

const triangle1 = (vals) => {
  for (let i = 0; i < vals.length - 1; i++) {
    for (let j = 0; j < vals.length - i - 1; j++) {
      vals[j] = (6 - vals[j] - vals[j + 1]) % 3;
    }
  }
  return vals[0];
};

// pascal(6);
// console.log('---');
// pascal(7);

// const choose = (n, k) => (k ? Math.round((n / k) * choose(n - 1, k - 1)) : 1);
/*
10c0 -> 1
10c1 -> 10/1 -> 10
10c2 -> 10/2 * 9/1 -> 45
10c3 -> 10/3 * 9/2 * 8/1 -> 120
10c4 -> 10/4 * 9/3 * 8/2 * 7/1 -> 210
10c9 -> 10/9 * 9/8 * 8/7 * 7/6 * 6/5 * 5/4 * 4/3 * 3/2 * 2/1 -> 10

*/

const mod = (a, b) => ((a % b) + b) % b;

const triangle2 = (vals) => {
  let m = 1;
  let t = vals[0];
  // console.log(1, vals[0]);
  for (let i = 1; i < vals.length; i++) {
    const prev = m;
    m = Math.round((m * (vals.length - i)) / i);
    console.log(m, m - prev, mod(m - prev, 2));
    // const m = choose(vals.length - 1, i);
    // console.log(m, vals[i]);
    t = (t + m * vals[i]) % 3;
  }
  return vals.length % 2 ? t : (3 - t) % 3;
};

const len = 11;

/*

n choose k
n! / (k!(n-k)!)

10 choose 4
10! / (4! * 6!)


*/

// const end = 1e4;
// // const end = 3 ** len;
// for (let i = end - 100; i < end; i++) {
//   const str = i.toString(3).padStart(len, 0);
//   const arr = str.split('').map(Number);

//   const t1 = triangle1(arr.slice());
//   const t2 = triangle2(arr.slice());
//   console.log(
//     [
//       ('' + i).padStart(3) + '.',
//       str,
//       // .split('')
//       // .map((c) => 'RGB'[c])
//       // .join(''),
//       t1,
//       t2,
//       t2 === t1 ? '' : 'BAD',
//     ].join(' ')
//   );
// }

const triangle = (input) =>
  'RGB'[triangle2(input.split('').map((c) => 'RGB'.indexOf(c)))];

// const result = triangle(
//   'GBRRRBGRBGBBRBRGBRGBRGGRBGGRRBGBGBRGRGBGRGRGGBBRGGRGRRBGGGRBGRRBBBBBGRBBBRBGRBBBRBGRBRGGRBBRRRRBRBBRRRGBGGBGGGRGBRBRRRBRBBBGBBBBGGBBGGRGBBGBBBBGBBBGGGGGBBRBRBGGGBRRBBBRRRBGGRRRBRRGBRGGRGBGBBGRBBBRGBBBBGRRBBBRRGBRRGGRBBBBRGBBGGRGBGGBGBBRRRBBRBBGBRGRGGRRGBRRBBGRRBGBGGBBRRBGBBGGGRRRG'
// );
// console.log(result, 'B');

const result = triangle('GBRRRBGRBGBGBRRRBGRBGB');

[3, 4, 5, 6].map((val, i, arr) => {
  if (i === arr.length - 1) return 'NOPE';
  return val * 2;
});
