const arr = {
  RR: 'R',
  BB: 'B',
  GG: 'G',
  BG: 'R',
  BR: 'G',
  GB: 'R',
  GR: 'B',
  RB: 'G',
  RG: 'B',
};
function triangle(r) {
  while (r.length > 1) {
    let inc = 1;
    while (r.length % (3 * inc) == 1) inc *= 3;

    let n = '';
    for (let i = 0; i < r.length - 1; i += inc) {
      n += arr[r[i] + r[i + inc]];
    }
    r = n;
  }
  return r;
}

// const base3 = (n) => {
//   const result = [];
//   for (; n; n = Math.floor(n / 3)) result.push(n % 3);
//   return result;
// };

// function triangle(input) {
//   const n3 = base3(input.length - 1);
//   let total = 0;
//   for (let i = 0; i < input.length; i++) {
//     const i3 = base3(i);
//     let mult = 1;
//     for (let j = 0; j < i3.length; j++) {
//       const k = n3[j] < i3[j] ? 0 : n3[j] < 2 ? 1 : 1 + (i3[j] === 1);
//       mult = (mult * k) % 3;
//     }
//     total = (total + mult * 'RGB'.indexOf(input[i])) % 3;
//   }
//   return 'RGB'[input.length % 2 ? total : (3 - total) % 3];
// }

console.time();
[
  ['B', 'B'],
  ['GB', 'R'],
  ['RRR', 'R'],
  ['RGBG', 'B'],
  ['RBRGBRB', 'G'],
  ['RBRGBRBGGRRRBGBBBGG', 'G'],
  [
    'BGGRRGRGGGGRRGBBGBRGRBBGGBGRRBBGBRBRRGRBRRRBRBRGRBRRGRGGBRRBRRRRBGRRBGBGBGRBGBGRGGBRGBRGBGRRGGGGBRRRGRGGGBBGRBBGGGRBBGGBBBGRGBBBBBBBRBRRGRBRGBBBBBBBBBGBBBRRRRBGRGGRRRRBGGRBBRRRBGGRRGGGRRRGGGRBRBRBGBGBRBRBRBRBGRGBRRBGGGBRGBGGBRRGRRGBBGRGGBBGGGBBBBGBRRBRGGRRRRGGBGRBRBRBRBBRGGRBBRGRGBBBGBGRRRGRGGRGBRRRGBGRRGGRGBBBBGRGGGRRBBRGGRGRBBRBBRGGGBGBGGBGBGRGGRGBRRGBGBBRBRBBRBBRRRRGRBRGBBBBBRRRRGRGBRRRBBRBGGRRGRBBGGRRGBGRBGGBBGRGGBGGGGGRRGRGRRBGBBGGRRGRRRGGBBRGGBGGRGBBBGRBGBGGRGRBBBBGRBBRGGBRBBBGRBRBRRGGBRBGRGBGRBRGBRGGRGGRBGRBGBBRRRRGGBRRGGRGGGGRBGBGRBGBGGGBBBGRGRRBRGGRGBGRBGRRBRRGGBRRRGGGGRBRRRBGBBRBGGGBBBGGRGGBGGBGGRGGGBRBBGGRRGGRRBRGRBBGRGGRRGRBRBRGGBRGBGRBBBGRBBRGGRBGBGBRBRGBRRBBGRGGBBRGBBBRGBGRGRGRBRRBRBBRGBBRRBBRGBBBBGBBRRBRGBBRGRBRBBGRGBRBGBBBGBGGBRBGGGBRGRRRRBGRBRGGGGGBGGRRRRGRGRRGRGGGRRRBBBGGGRRGGGRRRGBBRGGRRRRBBRGRGGBBBBRGBRBRGGBGBBRGGBRBRRGBRBRGGBGBGRRRRBBGRBRRGGGGBRRBRGRBGGRBBGBGBGBBRGRBBBBBBRGBBGGRBRBBBBRGBRGGRGBBGGBGBGBRBBGBRRGGGRBGRBRGBBBGGBGGBRRBRBRGGRRRGRGBBBBGRBBGGBGGGBGBRRRGGBGBBRRRBGGBBGRRGRGGBGGRBGRBBBRRBBBGGBGRBRBBGBBBBGRGGGGBRRRBGBBGRRGRRGBGBRRRRBRBBRRBBGGBBRBRRGRGGGBRGRRGRGGRRGRBBBBGBRBBGRBRBBRBGGBGBGGRGGGBBGGGBRBGBRBRBGBBBBGBGGRBRBBGBGBGBRBRGGBRRBGRRGRRGRRRGGBBBBRRRGBBBBGRGGBBGRBBGBBGGBGRGRRGRBBBRBBGGBBRGRBBBBGGBBRRRBBGRGBGRGRBGGRRRGRGRBRRGRGBBGRGRBBRBBBRRBRBBBGBRRBGGRRRBGGBBGBGGRRBBBRRGBRRGBGRGRBGRRBBRRBRRRBGBRGBRRGRGRRBBRBBRGBRGRBGBBBRRBBRBGBRGRGBRRRGRRBGGBBGGGRRRRGBBBBRRBBRGBRGGRGRRRRBBBBGBGBGBRRRGRGBGRBRGRRGGBBGBBBBBGBRGGRBGBRBBGBBBRBGGRRBRGRRRBBRGBGRGGGRBGRBGGRRRGRRRGBBGBBBBGBRRGGGBRBRBBBBRGGGBRRGRRGGBGBBRBBGGBRBBBBBBBGGRGBBGGRRBGBBGBGBGGGBGGRGGBRBBRRRBRRGBGRBRGRRBRGRRRGRBRBRRGGGBRRBBBBGBBGGBRBRGRRBRGGGGRGRRGGBRRBBBRBGGRGRGRRBBGGGBRGGBGRRGRBGRBBRGRBRBRRRBRGGGRGRBGGGRBRGRBBGBRBGRGGRGRBRBBBRGGBGBGBRBRRRRGBRBGRRBBBBBBBBRRBGBBBBGBRBBBBGRRRGGGGGGBRBBBBRGGBGRBGGBRGGRRGRBRRGRGRBGGGBRRGGRBGRBGGGBGGBGGRRBGBRRRBBBBGGRGBBRGRGBGGRBGRBGGRBBGBGRRBGBRRGRRRGGRGRBRRBRRBRBGRBBBBGGRBRBGBRGGGBGBGRRBRGRRGGBBRBBGGGRRBGBRRBBGGRBRBRBRRGBBRBBBRGGBRBGRRBRRRRBGRBRGGGRGRBGRBGGGRBBBRBGBRRBBGGBBRGRRBRRGRRGGBBRBRRBBBRGGBRBRBBRGBBBGRRRRRRRBGRBRBRGGGRBBGRRBRGBBGRRRRGGGBRRRBBRBBBRBGGBBBGBGRRGGBRGRBRGBBGBGRGGRRGRGGBBGBRGRRRBRBGRGRRBRRRGGGRBBGBGRGBRBGRBRBGBRGGBRRBGBRRRRGGBGRGRBGRBRBBGGGRRBGBRGBRGGBBRGBBBGBBGGGRRBGBGBBRGBBBBGBGRBBRBBBGRGRGRRRRRBRRBRRRGGRBRBBRBGBGGRGGGGRBBBBGGRGRGRRRBRRRRGRRRRRRGGBGRRBBBGRGGGBRGBRGRGRRBBRGRBGBBGBGBBGGBRRGBGGRRRBGGRBRRBRRBBRRBRBGRGBBBBBGBBBBRGGBGGGRBBGRGBRGRGBGBGGBRGRGRRRGGRBBRRRRRGGGGGBBGRRBGBBRGGBGBBBGGRGRRBBBGGGGRRRGRRRGBBRRGRRRRGRBRBBGBGRGBRBGBRBRRGBRGRBRBRGBGRRGBGBGGGBRRBBRRGBGBRBBRBGRRRRBBGGGBRBRBRGGBRRRBGGGRGRBGBGGRBGBBGGBBRRRRBRRRGGRGBBBRRGRBRGGGRBRBGBBGRBGRBBRGBBBBRRGBGRRBBRGGBRGBBBGGGRBRGRBRRBBGBRRGGGRRGGBBRGBGRBRBGRRBGBRGRBRBGBGBRGBGBGRRRGBGGGGBRRRRBRRGGBRBRRGBRRRRBBBGBGGBBBRGGBGGBBGBGBGGGRRBRBBBBGRGRBGRGRGBGRGRGGBBBBBGBBBBBBGBBRRRRRBGRRBGRBBBRRGGBGRBRGBBBBBGBBGBBRBBRRGGRGBRGGGRGGGGRRBBGRRRGRBBBGGGRGBRGGBRRBBRRGGGGRGGRGBGBRBRBBBRRRGBBGBBRGGGGGRRBGBBGGBRRGGRBRGBRBBGRRRGRRGRGGRBBBGBGRBRBBRGRRRBBGRBBGRRGRGGGGGBGRBBBGBGRBRGGRGBGBBGBRGBBBRGBGRGRGBGBGGBGGRGGGGBRRGGRRRGBBBRRBGRRBGGRRRRBBBGGRGBGGBRGBGRRRRRBBGGGRRGGGRRBGGGRGGBRGGBBRBBRBBBBRRGRRRGRGRBGBBRBRGGRGGGGRGRRRGGBGBBGRGBRRRBRRBGBBGBGGGRRRGBBBRGRBGBGBBRBRRGGGRRGRBRBBBBGGRRBRRRGBGRBRGRRBGRRRBGGBGBBRBRRRRGBBGRRBGRGBGBRRGBRBRGBBBBGGGBRGBGRGBBRRGGGGRGGBRBGRGRBBGBGGBBRRRBGGBGRGBRBGBBRBRBRBRRRBGBBGBRBRGGRRBRBGBRGGGGGRRBBRGRRRBGBBRBBRGRBGGRRRRGGGGGBRGBRGBGBRBRBRRBBGRGBRBGGBBRBRBBGGRRBGBGBRRGBRRGGGRGBBBRGGBBRGGRRRGGGBBGBRRGBRBRBBGRBRRGRRRRBBBBRRGGGRBGBBRGBGGBBBRBGBBBGBRGRBRRGRBGRGGGGRRBGRGBRRBRBGRBGRBBGGRBGGRBBGGGRBGGRGBBGGGBBGGBBRBBBBBBGGGBRRBRBRGBBBGRBGRGRBBRGGRRRRRBGBBRGRGBGGGBGBBBBGRBBRGGGBGGRGRRRGGGGRRBBRBBRGRBRBBBBBBGRRBRBGRRBGGBRGBBGGRRGRGGGGRRRBBGRRRBRRRBGRBRRBRBRGRBRBGGGGGBRGGGBRRGRRBGBRRBRGGBRRBRBGRGGRGGBRGBRBGRGRRBGBBBGGGGGRRBBGGRBRRGRGGRGBGRRGRBRBRGGGGGGRRBBGBGBBBRRBRGBBRBBRGGGBBGRRGRGGRGRGGBBRGGBRBGBRRBGRRBBRBBRBRRRGRBBGBGBRBBGRBBBBRGGBBRGBRGRRGRRGBGRBGBBGBBBRGBRBRRRRBGRBGRBRRRBGRGBRBBBBRBRBGRBRGGBBRRRRRRRRBBGRRRBBRGGRBBBRGGBRRGRGGBRBGRBGGBRBRRRGRRGGRRBGRRBBGGRGRGGBBRGRGGRRGGRRBRRRGBRRBRBRGRRGGRRGGRRRBBRGGBRBBBRBRGGBRRBBGRRBGGRGRGGGGGBGBGBBGBBBGRGGBRBGRGBBBBRRRRRRRGBGRBBBGRGGBGGRRRBRBBBBRRRGRGGRBGGRRBGGGGRRBGRRRRRRRBRGGRRBBGRBBBBRGRRGBGRBGGBRGRGRBGRGGGGBRGGBBRGRBRGGBGBBRGRBRRRGRBBGGRBGBGGRGBRBRGRGRBBRBBRBGGBGGBBBRRGRGRBRGGBRRGRRGBRRBGRGRGBBBRGRBRGGBGBBBBGGGRBRRBRRBBBBGBBBBRBBRBBBGRGGRGRBRRRBBRGBRBGGRGBGGRBRGBBGGBRGRGGGGBGRGBRBGBRBRBGGGGBRGGRRBGGBGRGBBBBBGBRBRBGGBGBBRRBRRRBGBGRGGBRGGRRRBRRRBGBRGRBRRBGBRBGBRRRRBBBBRGRBGGGGGRRRGRBGGBGBRGRBRRGGGGRGGBRGGGRRRGBRRBRBRRRGBGGGBRGGRBRBBBBRRGRRBGBBBBGBBBBGGRGBRBRBBGBBBBRBGGBBBGGGGRRGGGGGRGBRGGRGBBGRBRGGRBBBBGRGGBBGBRBBRRBGRGRBBBGBGGBGBGBGGRRBBBRGGRBRGRRGGBBBBBRBBBRRRRRBBRGBRGRRBGGBGBRBBRRGGRBBRBBBRRRGRBRGRBGBBRRRBGGGRGGRBGGRRBBGGRGBGRRGGBRRBRRRBGBGBBRBBBBGBRBGRRGRBRGBGRGRGGBBBRBGBBRBGBGGRBRRGBGRRBRBGBBRGBBRRGRRBRRBBBBRRRRBRBRRRBGRGGBGBBGRRGGGBBRRBBRGGRBGBBGBRBBBBRGRGRRBRBGGBRRGRRBBBRGGGRBBBGRGBGRRGGGBRGBBGBRBBRGGGRRBGRGRRRGGRGBBRRBBGBRRGRBBBBGRBGRRGBBBBBRBGBBBRGRGGBRGRBBGGBGBBBGRRGBBBRGGGGGBRGRRGRBGBGRGGRRGRBRGGBGGBBGBRBGGGGBRGGRRBBGRBGRGBRRGRRBRBBBGRGRGGGRBRBBBRBRRGGGBBBGRRGGRBBBRRGGGBGGBGRRBGGRGRGBRBGRBGGRBRRRRBBBBGGRGBBRGGRRRBGRGRBGBBRGRGGRBGGRGBBGGBBRBRBRBGBBGBGBRRRRGRBBBRRBRRGGRBBGRBBRBRGBRRRRBGRBRRGBRBRRBGRRGGRGGGRRBBBBBGRBGGGGBGRGRBBRGGGRRBGGBRBBRBRRBGRGRBGGRBRBBRGRBRRGBGGGRGBRBGGGBBGRGBRBGBRRGGRGGBRBGRRBGGRBRGBBGRRGRBRRGBGBBGGGGRRGGGRBBGGGBRRGBRRRBRGBRRRRGBRRBGGGRBGGRGBGBGBBBBGRRBGBGBGBBBRGBRBRBGRBGBRRGRGBBBGRRGBRBGGRBBGGRGBBBBGGGBBRBGGGRRGGGGBBGBGBBRGBGBRRRGBBRGRGBGGRBRRRRGRRRBRBRBBRRBRRBGRBBRGBBGBGBBGBBGRBRRGGGGRGGGBBRBRGRBBRGRRRRGGRRBGBBRBRRBBBRGGBGRRRGBRGGRBRGBRGBRRBRRBGRGBBGGGBGBBRRRGRGGBBGBBRBRBGGGBRRRGBBGGGGGGBGRGBBBRRRRGGBBGRGGGBRBGGRRBGGRBGRBGGRRBGGRRGBGBGBRRGGBGRBRGGRRGBRGRGGGRBRBBGGGBRBRRBGRBGGRRBGBGRBBRBRGBRRRRBGGBBBGGRBBBBRBGRRRBRGBGBBBGBBGGRBRRGRRGGRGBGBRBGGRBBGRGBRBRGRBRBGRGBGBGGGGRGRBRGGGBBRGRRBRRGBBBRRRBBRRBRRBGGBRGRRBGRBGGRBBRGGRGRGRRBBBGRRGBGGBRRBRBRGGBBRBRBGBRBBRRGBRRRRBRRRBRBRGRGGBBGGGBBRBBBBGGBRRBRGBGRBRRBBGRRRRBRRBGRBGBRRRBBGRBBGGGBGGRRBGGBRGRBBGBBGGBRRBGRBRBGRGRBBBRBGBGRRGBGRBGRGRGRBBRGBRRRRBBGRBGBBRBBRGRGGBBGRGBBBRBBRBRRRGGRBGGGRBGRRBGGGBRRRGBGGBBRRRGRRRBRGRBGGBGRGBGRRBBRRBGGRRRGRRBGRRRRRRBBGRRRGGBBBGBRGGBGBRBBBBBGGGGGGRRRRGGRGRBGRBBGBBRRGBGRGGRGBBBRGRBRRRRRBRRBRGBRRRBGGBGBRRRRGRBRBRRRGRBRRRGGBBGGBRBGGRBGGRRBBGRGRRGRRRBGBBBGBGBGBBRGBBBBRGGRBBBBGBRRRBGRRBGBGGGBGRBRRGRGRBBBGGBBBBBRBGRRGRBGGGBBBBRGGGRBBRGBBBGRRRRBRBRRBGGRGBBRGGGBRRRRBGGBBGRBRBGRBRBBBGGGBBGRBRRRGBGBGBRBGGGGBRGGGRRBBBBRBBBBBGGGRBRGRGRBGBGGGBBBBRGRGGRRGBRRBGBBRBRBBGGGGBGGRGBBBRGBRRGGGGGRBBRGGRGRRRRBGBGGGBBRBRRGRGGGGBRBRRGBGGBRRGGGBRRBRBRRBRGBBBBGBBGRBRBRGBBGGBRGGGRGBGBBGGBGGRBGBRRGGRBBRGRBGBGRGBRGGRRBBBRGGBBRRBGGBRBBRBBGRRBGBBGGGBRBRGGBBGGRRRGGBGGRRBBRRRRGRGGBBBGRGBRBRGGGGRGGBRGGBBRGBBGRGGBRBRGGBBGBBBGBRBRBBBGGRRGGBRBGGBRBBGBBBRBBRRBGRGGGGGGGBBRGBRBRBBRRBBGRBGGBBBBGGRBGRRBBRBGGBBBGRRBRGRGGGBRRBGRRBRRRBRRBGGRBGGBRGGBBRGBGRRGGRGBRRBBBGGRRBBRGRBBRBBBRGRBRGRRRGBGBBBBRRGGBGRGRBRGBBRRBGRRGBBRGGBBBBGBBRBGGRGGGRBRRRRGBBGRGGGGGBRGBGBBBRBRBGBRRBBBRRBRGGRBBGBBGGBBGBRBBBGRRRGRRGBBBBBRBRBRBBGBGBGBRRGGRRBRRRBBBRGGRBGRGGBBRGRRGBGRGRGBRBBBRBBRBBBBRGBGGBBRRRBRRBBBRBRRRGBGRRRRRGGRGRBRRGRBRGBGBGBGRBRRGBGRGBGGBGRRBGRBRGGGBRRGBRGRGBBGBBGRBGGBGRRRBGGGGBGRBRGRBGBGBRGRBGGBBBRBRRBBGRGGRBRRRBRGBBGBGGBBBGRGGGGBRBGGBGRBGBBRRRRBGBGGGGGBBRRRGBGGRRBGGBGBBRBBRBBGGRBRBGGRGRRRBRBBBRBRBGBBBBGGGBRRBGBBBBRRBGRGRGBRGBBBRRBBRBBRGBGRBGBRGRGRBGGGRBGBRGRRBRRRGGGRRRRBBGBGGGGBRGRGRBGRRGGGGBGGBBRRRGGRGBRBBBBBBBRGGBRGGGGRBRGGGBGBBGGGRGGGGRRRBBRBRBRBBGBGGRGBGBBRGGBBBGGBGGGGBBRGBBGGRRRRRBBGBGRRGBBGBRRRGBBBGGBBBBGGGRRGRBBRBBRRRRRGBGBRRBBRRBRGRRGGRRBGRBGRGBRGBBGRRRGGGRBRRGRBRBRBGGGRRGBRBRGGRRRRGRRGRGGRGGGRBGBRGGRRRGGBRGGGRGGRBGGRGRBGGRBBGBBGRBGBBBBBBRBGBGRBBRBGBBRGGBGGRRBBGGRBGBRRBBBGGGBBGRRGRGRGBRGRGGGBRGBGGBBRRGRGBBBGBGBRRGGBRGBGGGBGBBRBBGGGGBRBBRRRBRRGBBBBGBRRBGRGBRRGBBRGGRRRGBRRRRBRGRRGGRRRBBGBRBRGBRRGRRRBBRBGBBBBBRGBRRBBRBGBRBBBGGBGRBBRGGGGGGBBGGRBGGGRRRRBRRRRRGBRRGRBRGGGRRGGBRGRBBBRGGGBRBGRGRBBBRRRBGGGBGRGRBRBBRBBBRRRRGBBRBBBRRBBGBBBRBRRBBRGBRGGRRGRGGRBRBBGBRGBBGGRGRRRBRRBRRGGBBGGGRRRRBBGBGGBRGGRBBRRGRBBBRGBBBBGBRBGRBRRBRGRBBGGRRRGGRGGGBGBGBRGRRBRRGRBGBRBBRBGGBGRRBRGGBRBRBRGRRGRRBBRGBGGRRRBRGGRGBGBGBBGGGBRBBBBRBBRRBRBBGBGRBGBRRBBGRBBBGGRGBBBBGBBRBBBBBBBGGRRRGRBBBRBGGGBRBBRRGGRRGBRGBGBRBRRRGBGBGGGBRRRBBRGGGRBRBBGRBBRGGBGBBBRBGGGGRRBRRBGBBBGBRGGRGGRBGRBBBBBBBGRBRBGRBRRBBGRGBGRBBGBGRBBGBGGRBBRGGRGRGGGRBBRBRBBRGGRGBGBGRRGGBRGGGRGBRGRGBBRGRGBRRRBRGRRBRGRBRBRBGGBGGBRBRBRRBRBGRGRGRRRGGGRGRBGGBRRGBGRRGGBRBGBGBBRGGGRRRGRBGBRRBBRBBBBRRGRBGBGGGGBRGGRBGGRGBGBGBGBBRGGGGRGGBRGGBBBGRRBRBGGGBRBRRGGRGGRRBBBGBRRBRRBBRRRGBRRBBBGGRBRGBRBGGRBBRGRRBGGRBBGRBGRRRRRRGGGRRRGGGRRRRBBRBRGBGBRBGBGGBBRRRGGGBGBBBGGBGRRGBRGRBGBGGGBGGBGRBGRRGGRRRRRRBBGRBRGGGBRRRRGBGGGRGRRBGBRBRBBBBGBGRRGBBBBGRGBRRRGRRGBGGRRRBBRBGBBRBGGBGGBGGRGRRBGGRGRRBRBGBRGGGRGGRGBGRBBBGBRRBRGGGBRGBRGGGGRGRRRGBGRGGBGRBGRGBRGRRRBGGBRBBBBRRGGGBBRBGRGBRGGRRBGGRGBBRGRBBRGBBGRBBRGBRBBGRGGBGGRRBRGBGRGRRRGGBRBGBRGRGGGRBGGGRBBRGBBRRGBRRBGGBGGGRRBGBBBBRBRBGRBGRRGBGRRBRBRGGBGGBBGGBBRGGGGGGGRGBGRGRGBRGBBBGRRRRGBGGBBRGGRBRBRRRBRGBRBGRRBRRBBGGRGBRRBBGGRRGGBGRGRBRBRRBRRGBGBGBBGBGBBBRGBBRRBBGBRGBGGGRRRRBGRGRGBGRRBGBBRRBRRBRGRBBBGRBRRRBRRBBRBBGBRRGBRRBRRBRBGBBRGGRGGRGRRBGBRBRBBBBBBGBBGGGRRBGRRGBGBBRRGGRRBRBRRGRBRGBBGBGGRGGRGRRGGGBBRBRGRBBRGGGRBRGRRGGBBRRRRBBGBBRBRBBRBGGBGRRGRGBGGGGGRGBBBGGBRRBGGRGRBBGRRRGBRGRRGBRRGRGBRBRBBGGGRGRRRRBGGGGBGBGGGBGBBRBGBBRGGRBRBRBGBGBRGRGGBRBRRRBRRRBBRRBBGRGBRGRBRGRBRBGGGGRBBBBRBGGGBRGRGBGRRBGRRGBGBBRGRGBGBGBBGRGRGBBRGRRBBGGGRRBGBRGRGBBRBRBBGGGBRBRBBRBRRBGRBRGRBGGBRRGRRRGRGBBGGRRBBBBBRRGRBBRGRBRBRRBBRGGRBGBRRBRBBGBGRBGBRRGGGGBGRGRGGGBGBBBBGBRRRRRGBBBBRRBGBGBRBRGGBGGBBGGGRRGGGBGGRRGRRGRBRGGRBGGRGBBBRGRRRBRGGRBBBGRGBBGRGGGGGBGBGGGGRRBBBRRRGGRRGRBGRGRRBBGGGRBGGGGBBGBBBGGGRBGRGRBGGGGRBGRRBBRRGGBRRBRGBBRBGRRBGRBRGBBRRGBGRBRBGRGBRBRRRGBGGBBRRBBBGGBGGGGGRBRBGBBRGGRRGGGBRGRGGGRBRGRBGBRGRRGRGGRBBBBRRBGRGRGBBGGBRBGBBGBRBRGBRBRBGBRGRBBBGRRGGRRGGBBGGRGBRGRRBBRGRBGBGBGBGRBGBGGRRGGRBBGRRRGBGRRGGRBBBRGRRBRBGGBRBRGRGRGRRGRBGRGRRGBGBGGBGGBGGGBGBBRRBRBBRGRRRGBRGBBBRRBBRGBRBBBBBGBBGRBGGGGRRGGBBGRGRBBRGRBRRGGGGBRR',
    'G',
  ],
].forEach(([input, expected]) => {
  const actual = triangle(input);
  if (actual !== expected) {
    console.log(`For ${input}, expected ${expected}, got ${actual}`);
  } else {
    console.log('PASS');
  }
});
console.timeEnd();

// console.log(
//   [...Array(1e4)].map(() => 'RGB'[Math.floor(Math.random() * 3)]).join('')
// );

triangle('RBRGBRBGGGBR');