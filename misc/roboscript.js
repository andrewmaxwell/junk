const dirs = [
  {x: 1, y: 0},
  {x: 0, y: 1},
  {x: -1, y: 0},
  {x: 0, y: -1},
];

const expandCode = (code) => {
  let expanded = code.replace(/([FRL])(\d+)/g, (_, a, b) => a.repeat(b));
  while (/\)\d/.test(expanded)) {
    expanded = expanded.replace(/\(([^()]+)\)(\d+)/g, (_, a, b) => a.repeat(b));
  }
  return expanded;
};

const resolvePatterns = (code) => {
  const patterns = {};
  let resolved = code.replace(/p(\d+)([^q]*)q/g, (_, a, b) => {
    if (patterns[a]) throw new Error(`Pattern already defined: P${a}`);
    patterns[a] = b;
    return '';
  });
  for (let i = 0; i < 100 && /\d/.test(resolved); i++) {
    resolved = resolved.replace(/P(\d+)/g, (_, a) => {
      if (!patterns[a]) throw new Error(`Pattern not found: P${a}`);
      return patterns[a];
    });
  }
  if (/\d/.test(resolved)) throw new Error('Recursion too deep!');
  return resolved;
};

const movesToPath = (letters) => {
  const path = [{x: 0, y: 0}];
  let dir = 0;
  for (const letter of letters) {
    if (letter === 'F') {
      const p = path[path.length - 1];
      path.push({x: p.x + dirs[dir].x, y: p.y + dirs[dir].y});
    } else if (letter === 'L') dir = (dir + 3) % 4;
    else if (letter === 'R') dir = (dir + 1) % 4;
  }
  return path;
};

const getBoundingBox = (path) =>
  path.reduce(
    ([minX, minY, maxX, maxY], {x, y}) => [
      Math.min(minX, x),
      Math.min(minY, y),
      Math.max(maxX, x),
      Math.max(maxY, y),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );

const pathToGrid = (path) => {
  const [minX, minY, maxX, maxY] = getBoundingBox(path);
  const grid = new Array(maxY - minY + 1)
    .fill()
    .map(() => new Array(maxX - minX + 1).fill(' '));
  for (const {x, y} of path) grid[y - minY][x - minX] = '*';
  return grid.map((r) => r.join('')).join('\r\n');
};

const execute = (code) =>
  pathToGrid(movesToPath(resolvePatterns(expandCode(code))));

//////////////////

const {Test} = require('./test');
Test.assertEquals(execute(''), '*');
Test.assertEquals(execute('FFFFF'), '******');
Test.assertEquals(
  execute('FFFFFLFFFFFLFFFFFLFFFFFL'),
  '******\r\n*    *\r\n*    *\r\n*    *\r\n*    *\r\n******'
);
Test.assertEquals(
  execute('LFFFFFRFFFRFFFRFFFFFFF'),
  '    ****\r\n    *  *\r\n    *  *\r\n********\r\n    *   \r\n    *   '
);
Test.assertEquals(
  execute('LF5RF3RF3RF7'),
  '    ****\r\n    *  *\r\n    *  *\r\n********\r\n    *   \r\n    *   '
);

Test.assertEquals(
  execute('LF5(RF3)(RF3R)F7'),
  '    ****\r\n    *  *\r\n    *  *\r\n********\r\n    *   \r\n    *   '
);
Test.assertEquals(
  execute('(L(F5(RF3))(((R(F3R)F7))))'),
  '    ****\r\n    *  *\r\n    *  *\r\n********\r\n    *   \r\n    *   '
);
Test.assertEquals(
  execute('F4L(F4RF4RF4LF4L)2F4RF4RF4'),
  '    *****   *****   *****\r\n    *   *   *   *   *   *\r\n    *   *   *   *   *   *\r\n    *   *   *   *   *   *\r\n*****   *****   *****   *'
);
Test.assertEquals(
  execute('F4L((F4R)2(F4L)2)2(F4R)2F4'),
  '    *****   *****   *****\r\n    *   *   *   *   *   *\r\n    *   *   *   *   *   *\r\n    *   *   *   *   *   *\r\n*****   *****   *****   *'
);

Test.assertDeepEquals(
  execute('(F2LF2R)2FRF4L(F2LF2R)2(FRFL)4(F2LF2R)2'),
  '    **   **      *\r\n    **   ***     *\r\n  **** *** **  ***\r\n  *  * *    ** *  \r\n***  ***     ***  '
);

Test.assertDeepEquals(execute('p0(F2LF2R)2q'), '*');
Test.assertDeepEquals(execute('p312(F2LF2R)2q'), '*');

Test.assertDeepEquals(
  execute('p0(F2LF2R)2qP0'),
  '    *\r\n    *\r\n  ***\r\n  *  \r\n***  '
);
Test.assertDeepEquals(
  execute('p312(F2LF2R)2qP312'),
  '    *\r\n    *\r\n  ***\r\n  *  \r\n***  '
);

Test.assertDeepEquals(
  execute('P0p0(F2LF2R)2q'),
  '    *\r\n    *\r\n  ***\r\n  *  \r\n***  '
);
Test.assertDeepEquals(
  execute('P312p312(F2LF2R)2q'),
  '    *\r\n    *\r\n  ***\r\n  *  \r\n***  '
);

Test.assertDeepEquals(
  execute('F3P0Lp0(F2LF2R)2qF2'),
  '       *\r\n       *\r\n       *\r\n       *\r\n     ***\r\n     *  \r\n******  '
);

Test.assertDeepEquals(
  execute('(P0)2p0F2LF2RqP0'),
  '      *\r\n      *\r\n    ***\r\n    *  \r\n  ***  \r\n  *    \r\n***    '
);

Test.expectError(
  'Your interpreter should throw an error because pattern "P1" does not exist',
  function () {
    execute('p0(F2LF2R)2qP1');
  }
);
Test.expectError(
  'Your interpreter should throw an error because pattern "P0" does not exist',
  function () {
    execute('P0p312(F2LF2R)2q');
  }
);
Test.expectError(
  'Your interpreter should throw an error because pattern "P312" does not exist',
  function () {
    execute('P312');
  }
);

Test.assertDeepEquals(
  execute('P1P2p1F2Lqp2F2RqP2P1'),
  '  ***\r\n  * *\r\n*** *'
);
Test.assertDeepEquals(
  execute('p1F2Lqp2F2Rqp3P1(P2)2P1q(P3)3'),
  '  *** *** ***\r\n  * * * * * *\r\n*** *** *** *'
);

Test.expectError(
  'Your interpreter should throw an error since pattern "P1" is defined twice',
  function () {
    execute('p1F2Lqp1(F3LF4R)5qp2F2Rqp3P1(P2)2P1q(P3)3');
  }
);

Test.expectError(
  'Your interpreter should throw an error since pattern "P1" calls on itself indefinitely',
  function () {
    execute('p1F2RP1F2LqP1');
  }
);
Test.expectError(
  'Your interpreter should throw an error since pattern "P1" invokes "P2" which then again invokes "P1", creating an infinite cycle',
  function () {
    execute('p1F2LP2qp2F2RP1qP1');
  }
);
