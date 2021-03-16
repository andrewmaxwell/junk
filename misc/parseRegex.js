class Normal {
  constructor(c) {
    this.type = 'normal';
    this.c = c;
  }
  // toString() {
  //   return this.c;
  // }
}
class Any {
  constructor() {
    this.type = 'any';
  }
  // toString() {
  //   return '.';
  // }
}
class ZeroOrMore {
  constructor(r) {
    this.type = 'zeroOrMore';
    this.r = r;
  }
  // toString() {
  //   return this.r.toString() + '*';
  // }
}
class Or {
  constructor(a, b) {
    this.type = 'or';
    this.a = a;
    this.b = b;
  }
  // toString() {
  //   return `Or(${this.a.toString + '|' + this.b.toString()})`;
  // }
}
class Str {
  constructor(arr) {
    this.type = 'str';
    this.arr = arr;
  }
  // toString() {
  //   return `Str(${this.arr.map((r) => r.toString()).join('')})`;
  // }
}
////////////////////////////////////

const makeStr = (arr) => {
  const index = arr.indexOf('|');
  if (
    !arr.length ||
    index !== arr.lastIndexOf('|') ||
    index === 0 ||
    index === arr.length - 1
  )
    return null;
  if (arr.length == 1) return arr[0];
  if (index > -1)
    return new Or(makeStr(arr.slice(0, index)), makeStr(arr.slice(index + 1)));
  return new Str(arr);
};

const parseRegExp = (str) => {
  const stack = [];
  let curr = [];

  for (const c of str) {
    if (c === '(') {
      stack.push(curr);
      curr = [];
    } else if (c === ')') {
      if (!stack.length) return null;
      stack[stack.length - 1].push(makeStr(curr));
      curr = stack.pop();
    } else if (c === '*') {
      if (!curr.length || curr[curr.length - 1] instanceof ZeroOrMore)
        return null;
      curr.push(new ZeroOrMore(curr.pop()));
    } else if (c === '.') curr.push(new Any());
    else if (c === '|') curr.push('|');
    else curr.push(new Normal(c));
  }

  return stack.length ? null : makeStr(curr);
};

////////////////////////////////////
const normal = (...a) => new Normal(...a);
const any = (...a) => new Any(...a);
const zeroOrMore = (...a) => new ZeroOrMore(...a);
const or = (...a) => new Or(...a);
const str = (...a) => new Str(...a);

const tests = [
  ['ab*', str([normal('a'), zeroOrMore(normal('b'))])],
  ['(ab)*', zeroOrMore(str([normal('a'), normal('b')]))],
  ['ab|a', or(str([normal('a'), normal('b')]), normal('a'))],
  ['a(b|a)', str([normal('a'), or(normal('b'), normal('a'))])],
  ['a|b*', or(normal('a'), zeroOrMore(normal('b')))],
  ['(a|b)*', zeroOrMore(or(normal('a'), normal('b')))],

  ['a', normal('a')],
  ['ab', str([normal('a'), normal('b')])],
  ['a.*', str([normal('a'), zeroOrMore(any())])],
  [
    '(a.*)|(bb)',
    or(str([normal('a'), zeroOrMore(any())]), str([normal('b'), normal('b')])),
  ],

  ['', null],
  [')(', null],
  ['*', null],
  ['a(', null],
  ['()', null],
  ['a**', null],

  ['a|(a|a)', or(normal('a'), or(normal('a'), normal('a')))],
  ['(a|a)|a', or(or(normal('a'), normal('a')), normal('a'))],
  ['a|a|a', null],

  [
    '((aa)|ab)*|a',
    or(
      zeroOrMore(
        or(str([normal('a'), normal('a')]), str([normal('a'), normal('b')]))
      ),
      normal('a')
    ),
  ],
  [
    '((a.)|.b)*|a',
    or(
      zeroOrMore(or(str([normal('a'), any()]), str([any(), normal('b')]))),
      normal('a')
    ),
  ],
  ["|Kv'uui,?r[!6 BzaoO<", null],
  ['eLJ*T _H\'aOs(f?[@%ct"(k1X/+\\-xn~xQWK?#', null],
];

const {Test} = require('./test');
tests.forEach(([input, expected]) => {
  Test.assertDeepEquals(parseRegExp(input), expected);
});
