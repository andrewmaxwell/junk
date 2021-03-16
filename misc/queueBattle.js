function queueBattle(dist, ...armies) {
  armies = armies.map((army, index) => ({
    index,
    army: army.map((speed, index) => ({speed, index})),
  }));

  let bullets = [];

  while (armies.length > 1) {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      b.dist += b.speed;
      if (b.dist < dist) continue;
      armies[b.target].army[0] = 'dead';
      bullets.splice(i--, 1);
    }

    for (let i = 0; i < armies.length; i++) {
      const first = armies[i].army.shift();
      if (first !== 'dead') {
        bullets.push({
          target: (i + 1) % armies.length,
          speed: first.speed,
          dist: 0,
        });
        armies[i].army.push(first);
      }
    }

    if (armies.some(({army}) => !army.length)) {
      armies = armies.filter(({army}) => army.length);
      bullets = [];
    }
  }

  return armies[0]
    ? [armies[0].index, armies[0].army.map((a) => a.index)]
    : [-1, []];
}

const example_tests = [
  [100, [25, 38, 55, 46, 82], [64, 90, 37, 25, 58]],
  [200, [61, 83, 37, 55, 92, 35, 68, 72], [90, 81, 36, 114, 67, 25, 31, 84]],
  [300, [98, 112, 121, 95, 63], [120, 94, 90, 88, 30], [116, 144, 45, 200, 32]],
  [
    400,
    [186, 78, 56, 67, 78, 127, 78, 192],
    [78, 67, 208, 45, 134, 212, 82, 99],
    [327, 160, 49, 246, 109, 98, 44, 57],
  ],
  [
    500,
    [345, 168, 122, 269, 151],
    [56, 189, 404, 129, 101],
    [364, 129, 209, 163, 379],
    [520, 224, 154, 74, 420],
  ],
];
const test_solutions = [
  [1, [3, 2]],
  [0, [6, 7]],
  [0, [2]],
  [2, [0, 2, 5]],
  [-1, []],
];

const {Test} = require('./test');
example_tests.forEach((v, i) =>
  Test.assertDeepEquals(queueBattle(...v), test_solutions[i])
);
