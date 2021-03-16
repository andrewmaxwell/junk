const getCoords = (arr, s) => [
  arr.find((a) => a.includes(s)).indexOf(s),
  arr.findIndex((a) => a.includes(s)),
  'U',
];

const getMoves = ([x, y, o]) =>
  o === 'U'
    ? [
        ['R', [x + 1, y, 'R']],
        ['D', [x, y + 1, 'D']],
        ['L', [x - 2, y, 'R']],
        ['U', [x, y - 2, 'D']],
      ]
    : o === 'R'
    ? [
        ['R', [x + 2, y, 'U']],
        ['D', [x, y + 1, o]],
        ['L', [x - 1, y, 'U']],
        ['U', [x, y - 1, o]],
      ]
    : [
        ['R', [x + 1, y, o]],
        ['D', [x, y + 2, 'U']],
        ['L', [x - 1, y, o]],
        ['U', [x, y - 1, 'U']],
      ];

const isValid = ([x, y, o], arr) =>
  arr[y] &&
  '1BX'.includes(arr[y][x]) &&
  (o === 'U' ||
    (o === 'D'
      ? arr[y + 1] && '1BX'.includes(arr[y + 1][x])
      : '1BX'.includes(arr[y][x + 1])));

const bloxSolver = (arr) => {
  const start = getCoords(arr, 'B');
  const end = getCoords(arr, 'X').toString();
  const seen = {[start]: true};
  const q = [[start, '']];
  for (const [current, solution] of q) {
    for (const [dir, pos] of getMoves(current)) {
      if (pos.toString() === end) return solution + dir;
      if (seen[pos] || !isValid(pos, arr)) continue;
      seen[pos] = true;
      q.push([pos, solution + dir]);
    }
  }
};

const fixedTests = [
  [
    // RRDRRRD
    '1110000000',
    '1B11110000',
    '1111111110',
    '0111111111',
    '0000011X11',
    '0000001110',
  ],
  [
    '000000111111100',
    '111100111001100',
    '111111111001111',
    '1B11000000011X1',
    '111100000001111',
    '000000000000111',
  ],
  [
    '00011111110000',
    '00011111110000',
    '11110000011100',
    '11100000001100',
    '11100000001100',
    '1B100111111111',
    '11100111111111',
    '000001X1001111',
    '00000111001111',
  ],
  [
    '11111100000',
    '1B111100000',
    '11110111100',
    '11100111110',
    '10000001111',
    '11110000111',
    '11110000111',
    '00110111111',
    '01111111111',
    '0110011X100',
    '01100011100',
  ],
  [
    '000001111110000',
    '000001001110000',
    '000001001111100',
    'B11111000001111',
    '0000111000011X1',
    '000011100000111',
    '000000100110000',
    '000000111110000',
    '000000111110000',
    '000000011100000',
  ],
];
// const fixedSols = ['RRDRRRD',
// 				   'ULDRURRRRUURRRDDDRU',
// 				   'ULURRURRRRRRDRDDDDDRULLLLLLD',
// 				   'DRURURDDRRDDDLD',
// 				   'RRRDRDDRDDRULLLUULUUURRRDDLURRDRDDR'];

fixedTests.forEach((p) => console.log(bloxSolver(p)));
