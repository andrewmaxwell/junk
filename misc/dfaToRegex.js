const commonPrefixLength = (arr) => {
  for (let i = 0; arr[0].length; i++) {
    for (let j = 1; j < arr.length; j++) {
      if (arr[j][i] !== arr[0][i]) return i;
    }
  }
  return 0;
};

// common suffix? infix?

const joinOr = (parts) => {
  parts = [...new Set(parts)];
  if (parts.length < 2) return parts.join('|');
  const prefixLen = commonPrefixLength(parts);
  return prefixLen + 2 <= prefixLen * parts.length
    ? `${parts[0].slice(0, prefixLen)}(${parts
        .map((p) => p.slice(prefixLen))
        .join('|')})`
    : parts.join('|');
};

const dfaToRegex = (str) => {
  const letters = {};

  const dfa = str.split(',').map((p) => {
    const [from, to, consume = ''] = p.trim().split(' ');
    if (!letters[from]) letters[from] = {prev: 0, next: 0};
    letters[from].next++;

    if (!letters[to]) letters[to] = {prev: 0, next: 0};
    letters[to].prev++;
    return {from, to, consume};
  });

  console.log('>>>', dfa);

  return joinOr(
    Object.entries(letters)
      .sort((a, b) => a[1].prev * a[1].next - b[1].prev * b[1].next)
      .reduce((dfa, [s]) => {
        if (s === 'start' || s === 'end') return dfa;
        const result = dfa.filter((d) => d.to !== s && d.from !== s);

        const loops = joinOr(
          dfa.filter((d) => d.to === s && d.from === s).map((d) => d.consume)
        );

        const loopRegex =
          loops.length > 1 ? `(${loops})*` : loops.length ? loops + '*' : '';

        for (const a of dfa) {
          if (a.to !== s || a.from === s) continue;
          for (const b of dfa) {
            if (b.from !== s || b.to === s) continue;
            result.push({
              from: a.from,
              to: b.to,
              consume: a.consume + loopRegex + b.consume,
            });
          }
        }
        console.log('>>>', s, result);
        return result;
      }, dfa)
      .map((d) => d.consume)
  );
};

const {Test} = require('./test');

Test.assertDeepEquals(dfaToRegex(`start A, A B 0, B A 1, B end`), '0(10)*');
Test.assertDeepEquals(
  dfaToRegex(
    `start q1, q1 q2 a, q2 q4 b, q2 q3 c, q2 q5 d, q4 end, q3 end, q5 end`
  ),
  'a(b|c|d)'
);

Test.assertDeepEquals(
  dfaToRegex('start q1, q1 q1 c, q1 q2 a, q2 q1 b, q2 q2 d, q2 end'),
  'c*a(d|bc*a)*'
);

Test.assertDeepEquals(
  dfaToRegex(
    'start A, A A b, A B a, B B a, B C b, C C b, C D a, D D a, D D b, A end, B end, C end'
  ),
  'b*(|aa*|aa*bb*)'
);

Test.assertDeepEquals(
  dfaToRegex('start A, A B a, B A b, A C b, C A a, C B b, A end'),
  '(ab|ba|bbb)*'
);

Test.assertDeepEquals(
  dfaToRegex('start A, A C a, A B b, C B a, B B a, B B b, C end'),
  'a'
);

Test.assertDeepEquals(
  dfaToRegex('start A, A B a, B B a, A C b, C C a, B end, C end'),
  'aa*|ba*'
);
