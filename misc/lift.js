// https://www.codewars.com/kata/58905bfa1decb981da00009e/train/javascript

const theLift = (queues, capacity) => {
  let current = 0;
  let passengers = [];
  let dir = 1;
  const result = [];

  const stop = () => {
    if (result[result.length - 1] !== current) result.push(current);
    passengers = passengers.filter((p) => p !== current);
    for (
      let i = 0;
      i < queues[current].length && passengers.length < capacity;
      i++
    ) {
      if (queues[current][i] > current === dir > 0) {
        passengers.push(...queues[current].splice(i--, 1));
      }
    }
  };

  stop();

  while (passengers.length || queues.some((f) => f.length)) {
    current += dir;
    if (!current || current >= queues.length - 1) dir *= -1;
    if (
      passengers.includes(current) ||
      queues[current].some((p) => p > current === dir > 0)
    )
      stop();
  }

  if (current) {
    current = 0;
    stop();
  }
  return result;
};

const {Test} = require('./test');

Test.it('up', function () {
  var queues = [
    [], // G
    [], // 1
    [5, 5, 5], // 2
    [], // 3
    [], // 4
    [], // 5
    [], // 6
  ];
  var result = theLift(queues, 5);
  Test.assertSimilar(result, [0, 2, 5, 0]);
});

Test.it('down', function () {
  var queues = [
    [], // G
    [], // 1
    [1, 1], // 2
    [], // 3
    [], // 4
    [], // 5
    [], // 6
  ];
  var result = theLift(queues, 5);
  Test.assertSimilar(result, [0, 2, 1, 0]);
});

Test.it('up and up', function () {
  var queues = [
    [], // G
    [3], // 1
    [4], // 2
    [], // 3
    [5], // 4
    [], // 5
    [], // 6
  ];
  var result = theLift(queues, 5);
  Test.assertSimilar(result, [0, 1, 2, 3, 4, 5, 0]);
});

Test.it('down and down', function () {
  var queues = [
    [], // G
    [0], // 1
    [], // 2
    [], // 3
    [2], // 4
    [3], // 5
    [], // 6
  ];
  var result = theLift(queues, 5);
  Test.assertSimilar(result, [0, 5, 4, 3, 2, 1, 0]);
});
Test.assertDeepEquals(theLift([[3], [2], [0], [2], [], [], [5]], 5), [
  0,
  1,
  2,
  3,
  6,
  5,
  3,
  2,
  0,
]);

Test.assertDeepEquals(
  theLift([[], [], [4, 4, 4, 4], [], [2, 2, 2, 2], [], []], 2),
  [0, 2, 4, 2, 4, 2, 0]
);

Test.assertDeepEquals(
  theLift([[3, 3, 3, 3, 3, 3], [], [], [], [], [], []], 5),
  [0, 3, 0, 3, 0]
);

Test.assertDeepEquals(
  theLift(
    [
      [7, 3, 5, 9],
      [8],
      [3, 6, 3, 0],
      [0, 1],
      [2, 10, 7, 2],
      [8, 6],
      [],
      [],
      [0, 10, 9],
      [0],
      [2, 8],
    ],
    1
  ),
  [
    0,
    1,
    2,
    4,
    5,
    7,
    8,
    10,
    9,
    8,
    4,
    3,
    2,
    0,
    1,
    2,
    3,
    4,
    5,
    8,
    10,
    9,
    8,
    4,
    3,
    0,
    1,
    2,
    4,
    5,
    8,
    9,
    4,
    3,
    0,
    1,
    2,
    4,
    5,
    9,
    4,
    3,
    2,
    1,
    2,
    4,
    5,
    8,
    4,
    3,
    2,
    3,
    4,
    5,
    7,
    3,
    0,
    2,
    5,
    6,
    3,
    1,
    2,
    3,
    5,
    6,
    0,
  ]
);
