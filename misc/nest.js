// const getIndexOfClose = ([first, ...rest], index, depth) =>
//   first === ')' && !depth
//     ? index
//     : getIndexOfClose(
//         rest,
//         index + 1,
//         depth + (first === '(' ? 1 : first === ')' ? -1 : 0)
//       );

// const goDeeper = (arr, index) => [
//   nest(arr.slice(0, index)),
//   ...nest(arr.slice(index + 1)),
// ];

// const nest = ([first, ...rest]) =>
//   first === '('
//     ? goDeeper(rest, getIndexOfClose(rest, 0, 0))
//     : first
//     ? [first, ...nest(rest)]
//     : [];

/*

*/

// const nest = ([first, ...rest]) => {
//   if (!first) return [];
//   if (first === '(') {
//     let depth = 1;
//     for (let i = 0; i < rest.length; i++) {
//       if (rest[i] === '(') depth++;
//       else if (rest[i] === ')' && !--depth) {
//         return [nest(rest.slice(0, i)), ...nest(rest.slice(i + 1))];
//       }
//     }
//   }
//   return [first, ...nest(rest)];
// };

const nest = (input, acc = []) => {
  const token = input.shift();
  if (token === undefined || token === ')') return acc;
  return nest(input, [...acc, token === '(' ? nest(input) : token]);
};

import {Test} from './test.js';

Test.assertDeepEquals(nest(['a']), ['a']);
Test.assertDeepEquals(nest(['(', 'a', 'b', ')']), [['a', 'b']]);
Test.assertDeepEquals(nest('a(b(c)(d))e'.split('')), [
  'a',
  ['b', ['c'], ['d']],
  'e',
]);

// nest([')', 'a']);

/*

(a ( b ( c ) d ( e ) f ))

[a, [b, [c], d, [e], f]]


*/
