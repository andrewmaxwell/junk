// const nums = {
//   zero: 0,
//   one: 1,
//   two: 2,
//   three: 3,
//   four: 4,
//   five: 5,
//   six: 6,
//   seven: 7,
//   eight: 8,
//   nine: 9,
//   ten: 10,
//   eleven: 11,
//   twelve: 12,
//   thirteen: 13,
//   fourteen: 14,
//   fifteen: 15,
//   sixteen: 16,
//   seventeen: 17,
//   eighteen: 18,
//   nineteen: 19,
//   twenty: 20,
//   thirty: 30,
//   forty: 40,
//   fifty: 50,
//   sixty: 60,
//   seventy: 70,
//   eighty: 80,
//   ninety: 90,
// };

// const mults = {hundred: 100, thousand: 1000, million: 1e6};

// const parseInt = (str) => {
//   let total = 0;
//   let current = 0;
//   for (const w of str.split(/-| and | /g)) {
//     if (w in nums) current += nums[w];
//     else if (w in mults) {
//       current *= mults[w];
//       if (w !== 'hundred') {
//         total += current;
//         current = 0;
//       }
//     }
//   }
//   return total + current;
// };

// const {Test} = require('./test');
// Test.assertEquals(parseInt('one'), 1);
// Test.assertEquals(parseInt('twenty'), 20);
// Test.assertEquals(parseInt('two hundred forty-six'), 246);

// [
//   ['six thousand five hundred ninety-nine', 6599],
//   ['six hundred sixty-six thousand six hundred sixty-six', 666666],
// ].forEach(([s, v]) => {
//   Test.assertEquals(parseInt(s), v);
// });

function mix(s1, s2) {
  const c1 = {};
  for (const t of s1.match(/[a-z]/g)) c1[t] = (c1[t] || 0) + 1;

  const c2 = {};
  for (const t of s2.match(/[a-z]/g)) c2[t] = (c2[t] || 0) + 1;

  const result = [];
  for (const t in {...c1, ...c2}) {
    const l1 = c1[t] || 0;
    const l2 = c2[t] || 0;
    if (l1 <= 1 && l2 <= 1) continue;
    result.push(
      (l1 === l2 ? '=' : l1 > l2 ? 1 : 2) + ':' + t.repeat(Math.max(l1, l2))
    );
  }

  return result
    .sort(
      (a, b) =>
        b.length - a.length ||
        (a[0] === '=') - (b[0] === '=') ||
        a.localeCompare(b)
    )
    .join('/');
}

const {Test} = require('./test');
Test.assertEquals(
  mix('Are they here', 'yes, they are here'),
  '2:eeeee/2:yy/=:hh/=:rr'
);
Test.assertEquals(
  mix('looping is fun but dangerous', 'less dangerous than coding'),
  '1:ooo/1:uuu/2:sss/=:nnn/1:ii/2:aa/2:dd/2:ee/=:gg'
);
Test.assertEquals(
  mix(' In many languages', " there's a pair of functions"),
  '1:aaa/1:nnn/1:gg/2:ee/2:ff/2:ii/2:oo/2:rr/2:ss/2:tt'
);
Test.assertEquals(mix('Lords of the Fallen', 'gamekult'), '1:ee/1:ll/1:oo');
Test.assertEquals(mix('codewars', 'codewars'), '');
Test.assertEquals(
  mix('A generation must confront the looming ', 'codewarrs'),
  '1:nnnnn/1:ooooo/1:tttt/1:eee/1:gg/1:ii/1:mm/=:rr'
);
