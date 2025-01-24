// https://www.codewars.com/kata/58b8e48a4dda07e85f00013a/train/javascript

const getNums = (n) =>
  n === 1
    ? n
    : n % 3 === 0
    ? `${n} D ${getNums(n / 3)}`
    : n % 3 === 1
    ? `${n} U ${getNums((4 * n + 2) / 3)}`
    : `${n} d ${getNums((2 * n - 1) / 3)}`;

// for (let i = 1; i <= 10; i++) console.log(getNums(i));

// const nodes = {1: {}};

// const set = (v, p, t) => {
//   nodes[v] = nodes[v] || {v};
//   nodes[p] = nodes[p] || {v: p};
//   nodes[p][t] = nodes[v];
// };

// for (let i = 2; i <= 100; i++) {
//   if (i % 3 === 0) set(i, i / 3, 'D');
//   else if (i % 3 === 1) set(i, (4 * i + 2) / 3, 'U');
//   else set(i, (2 * i - 1) / 3, 'd');
// }

// console.dir(nodes[1], {depth: null});

const getSteps = (n) =>
  n === 1
    ? ''
    : n % 3 === 0
    ? 'D' + getSteps(n / 3)
    : n % 3 === 1
    ? 'U' + getSteps((4 * n + 2) / 3)
    : 'd' + getSteps((2 * n - 1) / 3);

const freakContazSequence = (prefix) => {
  for (let i = 1; i < 1e6; i++) {
    if (getSteps(i).startsWith(prefix)) return i;
  }
};

for (let i = 0; i < 100; i++) {
  const str = i.toString(3).replace(/./g, (a) => ({0: 'D', 1: 'U', 2: 'd'}[a]));
  const num = freakContazSequence(str);
  console.log(str, getSteps(num).slice(str.length), num);
}

// import {Test} from './test.js';
// Test.failFast = true;

// Test.assertDeepEquals('d', getSteps(2));
// Test.assertDeepEquals('D', getSteps(3));
// Test.assertDeepEquals('U', getSteps(4));
// Test.assertDeepEquals('dU', getSteps(11));
// Test.assertDeepEquals('DU', getSteps(12));
// Test.assertDeepEquals('DdU', getSteps(33));
// Test.assertDeepEquals('DdDddUUdDD', getSteps(231));
// Test.assertDeepEquals('UddUDUD', getSteps(1450));
// Test.assertDeepEquals('UDdDDUd', getSteps(2218));
// Test.assertDeepEquals('UDUDUDUddDUUUdd', getSteps(9193711));
// Test.assertDeepEquals('ddDddUDUDUDUddDUUUdd', getSteps(1883021696));

// Test.assertDeepEquals(freakContazSequence('d'), 2);
// Test.assertDeepEquals(freakContazSequence('D'), 3);
// Test.assertDeepEquals(freakContazSequence('U'), 4);
// Test.assertDeepEquals(freakContazSequence('dU'), 11);
// Test.assertDeepEquals(freakContazSequence('DU'), 12);
// Test.assertDeepEquals(freakContazSequence('DdU'), 33);
// Test.assertDeepEquals(freakContazSequence('DdDddUUdDD'), 231);
// Test.assertDeepEquals(freakContazSequence('UddUDUD'), 1450);
// Test.assertDeepEquals(freakContazSequence('UDdDDUd'), 2218);
// Test.assertDeepEquals(freakContazSequence('UDUDUDUddDUUUdd'), 9193711);
// Test.assertDeepEquals(freakContazSequence('ddDddUDUDUDUddDUUUdd'), 1883021696);

const eq = (a, b) => [...a].sort().join('') === [...b].sort().join('');

function recover(str) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    for (const n in alph) {
      if (eq(str.slice(i, i + n.length), n)) result += alph[n];
    }
  }
  return result || 'No digits found';
}
