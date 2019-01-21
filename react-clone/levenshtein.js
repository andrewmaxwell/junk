'use strict';
const {equals} = window.R;

export const diff = (a, b) => {
  var m = [];
  for (var i = 0; i <= b.length; i++) m[i] = [i];
  for (var j = 0; j <= a.length; j++) m[0][j] = j;
  for (i = 0; i < b.length; i++) {
    for (j = 0; j < a.length; j++) {
      m[i + 1][j + 1] = equals(a[j], b[i])
        ? m[i][j]
        : Math.min(m[i][j], m[i + 1][j], m[i][j + 1]) + 1;
    }
  }

  let res = [];
  while (i || j) {
    const v = m[i][j];
    const di = i && j ? m[i - 1][j - 1] : Infinity;
    const lt = j ? m[i][j - 1] : Infinity;
    const up = i ? m[i - 1][j] : Infinity;
    var min = Math.min(di, lt, up);
    if (di === min) {
      if (v !== min)
        res.push({
          type: 'replace',
          index: j - 1,
          value: b[i - 1],
          prev: a[j - 1]
        });
      i--;
      j--;
    } else if (lt === min) {
      res.push({type: 'remove', index: j - 1, value: a[j - 1]});
      j--;
    } else if (up === min) {
      res.push({type: 'insert', index: i - 1, value: b[i - 1]});
      i--;
    }
  }
  // console.log(
  //   [[' ', ...a], ...m].map((r, i) =>
  //     [b[i - 2] || '', ...r].map(
  //       v => v.toString().padStart(2)
  //     ).join('')
  //   ).join('\n')
  // );
  return res;
};

const runTests = () => {
  const tests = [
    [() => diff('abcdefg', 'abcdefg'), []],
    [() => diff('abc', 'bc'), [{type: 'remove', index: 0, value: 'a'}]],
    [() => diff('abcd', 'abd'), [{type: 'remove', index: 2, value: 'c'}]],
    [() => diff('abcdefg', 'abcdef'), [{type: 'remove', index: 6, value: 'g'}]],
    [
      () => diff('abcdefg', 'abxdefg'),
      [{type: 'replace', index: 2, value: 'x', prev: 'c'}]
    ],
    [
      () => diff('abcdefg', 'abxcdefg'),
      [{type: 'insert', index: 2, value: 'x'}]
    ],
    [
      () => diff('abcdefg', 'abcdefgx'),
      [{type: 'insert', index: 7, value: 'x'}]
    ],
    [
      () => diff('abcdefg', 'xabcdefg'),
      [{type: 'insert', index: 0, value: 'x'}]
    ],
    [
      () => diff('abcdefg', 'bcdefga'),
      [
        {type: 'insert', index: 6, value: 'a'},
        {type: 'remove', index: 0, value: 'a'}
      ]
    ],
    [
      () => diff('saturday', 'sunday'),
      [
        {type: 'replace', index: 4, value: 'n', prev: 'r'},
        {type: 'remove', index: 2, value: 't'},
        {type: 'remove', index: 1, value: 'a'}
      ]
    ],
    [
      () =>
        diff(
          [
            {tag: 'div', children: ['abc']},
            {tag: 'div', children: ['cde']},
            {tag: 'input', value: 'fgh'}
          ],
          [
            {tag: 'div', children: ['abc']},
            {tag: 'div', children: ['cde']},
            {tag: 'div', children: ['fgh']},
            {tag: 'input', value: ''}
          ]
        ),
      [
        {
          type: 'replace',
          index: 2,
          value: {tag: 'input', value: ''},
          prev: {tag: 'input', value: 'fgh'}
        },
        {type: 'insert', index: 2, value: {tag: 'div', children: ['fgh']}}
      ]
    ]
  ];
  const passing = tests.filter(([func, expected]) => {
    const actual = func();
    if (equals(actual, expected)) {
      return true;
    } else {
      console.error(
        `Expected ${func} to be ${JSON.stringify(
          expected,
          null,
          2
        )}, got ${JSON.stringify(actual, null, 2)}`
      );
    }
  });
  console.log(`${passing.length}/${tests.length} tests passing`);
};
setTimeout(runTests, 1);
