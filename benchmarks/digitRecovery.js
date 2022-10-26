import {benchmark} from './benchmark.js';

const alph = {
  ZERO: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
};

const eq = (a, b) => a.sort().join('') === [...b].sort().join('');
const recoverLoop = ([...str]) => {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    for (const n in alph) {
      if (eq(str.slice(i, i + n.length), n)) {
        result += alph[n];
        break;
      }
    }
  }
  return result || 'No digits found';
};

/////////

const seq = (str) => (n) =>
  [...str.slice(0, n.length)].sort().join('') === [...n].sort().join('');

const val = (key) => (key in alph ? alph[key] : '');

const rec = (str) =>
  str ? val(Object.keys(alph).find(seq(str))) + rec(str.slice(1)) : '';

const recoverFunctional = (str) => rec(str) || 'No digits found';

///////////

const permutations = (arr, m = []) =>
  arr.length
    ? arr.flatMap((el, i) =>
        permutations([...arr.slice(0, i), ...arr.slice(i + 1)], [...m, el])
      )
    : [m];

const trie = {};
for (const n in alph) {
  for (const arr of permutations([...n])) {
    let c = trie;
    for (const el of arr) {
      c = c[el] = c[el] || {};
    }
    c._ = alph[n];
  }
}

const getMatch = (str, i) => {
  let c = trie;
  for (; i < str.length; i++) {
    c = c[str[i]];
    if (!c) break;
    if (c._ !== undefined) return c._;
  }
  return '';
};

const recoverFast = (str) => {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    result += getMatch(str, i);
  }
  return result || 'No digits found';
};

///////

function taylor(str) {
  let myStr = str;
  const alph = {
    EORZ: '0',
    ENO: '1',
    OTW: '2',
    EEHRT: '3',
    FORU: '4',
    EFIV: '5',
    ISX: '6',
    EENSV: '7',
    EGHIT: '8',
    EINN: '9',
  };
  const order = [3, 4, 5];
  let answer = '';

  while (myStr.length > 2) {
    order.forEach((n) => {
      const subStr = myStr.slice(0, n).split('').sort().join('');
      if (subStr.length >= n && alph[subStr]) answer += alph[subStr];
    });
    myStr = myStr.slice(1, myStr.length);
  }
  return answer || 'No digits found';
}

benchmark(
  {
    recoverLoop,
    recoverFunctional,
    taylor,
    recoverFast,
  },
  [
    ['NEO'],
    ['ONETWO'],
    ['TWWTONE'],
    ['OTNE'],
    ['ZYX'],
    ['ONENO'],
    ['ZERO'],
    ['NEOTWONEINEIGHTOWSVEEN'],
    ['FOURSEVENTHREENINETWOIOSNSIXNNEIGHTFIVEONEJFTHREE'],
  ]
);
