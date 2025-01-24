// https://www.codewars.com/kata/63b1c240a4ade100500f665e/train/javascript

const basicAttack = (health, [[hp, ap], ...rest], solution) =>
  fight(
    health - (hp > 2 ? ap : 0),
    hp > 2 ? [[hp - 2, ap], ...rest] : rest,
    solution + 'B'
  );

const specialAttack = (health, [[hp, ap], ...rest], solution) =>
  !solution.slice(-2).includes('C') &&
  fight(
    health - (hp > 4 ? ap : 0),
    hp > 4 ? [[hp - 4, ap], ...rest] : rest,
    solution + 'C'
  );

const criticalDamage = (level) => {
  const nextLevel = level.map((l) => [...l]);
  for (let i = 0; i < 4; i++) {
    if (!nextLevel[i] || nextLevel[i][0] <= 0) break;
    nextLevel[i][0] -= 2 ** (3 - i);
  }
  if (nextLevel[0][0] <= 0) nextLevel.shift();
  return nextLevel;
};

const criticalAttack = (health, level, solution) => {
  const selfDamage =
    solution[solution.length - 1] === 'A'
      ? 8
      : solution[solution.length - 2] === 'A'
      ? 4
      : 0;

  const [[hp, ap]] = level;
  return fight(
    health - (hp > 8 ? ap : 0) - selfDamage,
    criticalDamage(level),
    solution + 'A'
  );
};

const fight = (health, level, solution = '') => {
  // if (!solution) console.log('>>>', health, level);
  if (health <= 0) return false;
  console.log('>>>', {health, level, solution});
  if (!level.length) return solution;

  // if (level[0][0] <= 2) {
  //   return basicAttack(health, level, solution);
  // }

  return (
    basicAttack(health, level, solution) ||
    specialAttack(health, level, solution) ||
    criticalAttack(health, level, solution)
  );
};

// const criticalDamage = (level) => {
//   const nextLevel = level.map((l) => [...l]);
//   for (let i = 0; i < 4; i++) {
//     if (!nextLevel[i] || nextLevel[i][0] <= 0) break;
//     nextLevel[i][0] -= 2 ** (3 - i);
//   }
//   if (nextLevel[0][0] <= 0) nextLevel.shift();
//   return nextLevel;
// };

// const fight = (health, level) => {
//   const queue = [{health, level, solution: ''}];

//   while (queue.length) {
//     const {health, level, solution} = queue.pop();

//     if (health <= 0) continue;
//     console.log('>>>', {health, level, solution}, queue.length);
//     if (!level.length) return solution;

//     const [[hp, ap], ...rest] = level;

//     // critical
//     const selfDamage =
//       solution[solution.length - 1] === 'A'
//         ? 8
//         : solution[solution.length - 2] === 'A'
//         ? 4
//         : 0;

//     queue.push({
//       health: health - (hp > 8 ? ap : 0) - selfDamage,
//       level: criticalDamage(level),
//       solution: solution + 'A',
//     });

//     // special
//     if (!solution.slice(-2).includes('C')) {
//       queue.push({
//         health: health - (hp > 4 ? ap : 0),
//         level: hp > 4 ? [[hp - 4, ap], ...rest] : rest,
//         solution: solution + 'C',
//       });
//     }

//     // basic
//     queue.push({
//       health: health - (hp > 2 ? ap : 0),
//       level: hp > 2 ? [[hp - 2, ap], ...rest] : rest,
//       solution: solution + 'B',
//     });
//   }
// };

//////////////////////

import {Test, it} from './test.js';

const VERBOSE = 1;

Test.failFast = true;

function replay(health, level, solution) {
  level = level.map((b) => [...b]);
  let timeSinceSpecial = Infinity;
  let timeSinceCritical = Infinity;
  if (VERBOSE) console.log({level, health});
  for (const c of solution) {
    if (VERBOSE) console.log({move: c});
    if (c === 'B') {
      level[0][0] -= 2;
    } else if (c === 'C') {
      if (timeSinceSpecial < 3) {
        return `Insufficient special cooldown.`;
      }
      level[0][0] -= 4;
      timeSinceSpecial = 0;
    } else if (c === 'A') {
      if (timeSinceCritical === 1) health -= 8;
      else if (timeSinceCritical === 2) health -= 4;
      for (let i = 0; i < 4; i++) {
        if (!level[i] || level[i][0] <= 0) break;
        level[i][0] -= 2 ** (3 - i);
      }
      timeSinceCritical = 0;
    }

    if (level[0][0] <= 0) level.shift();
    else health -= level[0][1];

    if (VERBOSE) console.log({level, health});

    if (health <= 0) {
      return 'Defeat';
    } else if (!level.length) {
      return true;
    }
    timeSinceSpecial++;
    timeSinceCritical++;
  }
  return 'did not finish';
}

Test.assertDeepEquals(
  criticalDamage([
    [9, 1],
    [7, 1],
    [5, 1],
    [4, 1],
    [9, 1],
  ]),
  [
    [1, 1],
    [3, 1],
    [3, 1],
    [3, 1],
    [9, 1],
  ]
);

Test.assertDeepEquals(
  criticalDamage([
    [8, 1],
    [7, 1],
    [5, 1],
    [4, 1],
    [9, 1],
  ]),
  [
    [3, 1],
    [3, 1],
    [3, 1],
    [9, 1],
  ]
);

Test.assertDeepEquals(
  replay(
    10,
    [
      [2, 4],
      [4, 6],
      [0, 0],
      [8, 10],
    ],
    'BBB-ACB-A-'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    1,
    [
      [0, 0],
      [0, 0],
    ],
    '--'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    1,
    [
      [0, 0],
      [0, 0],
    ],
    '-'
  ),
  'did not finish'
);

Test.assertDeepEquals(
  replay(
    1,
    [
      [0, 0],
      [0, 0],
    ],
    'BB'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [2, 2],
      [4, 1],
    ],
    'BBB'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [2, 2],
      [4, 1],
    ],
    '--B'
  ),
  'Defeat'
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [4, 8],
      [2, 1],
    ],
    'CB'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [4, 8],
      [0, 0],
      [0, 0],
      [4, 8],
    ],
    'C--C'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [4, 8],
      [0, 0],
      [0, 0],
      [4, 8],
    ],
    'CC'
  ),
  'Insufficient special cooldown.'
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [4, 8],
      [0, 0],
      [0, 0],
      [4, 8],
    ],
    'AA'
  ),
  'Defeat'
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [8, 8],
      [4, 8],
      [2, 4],
      [1, 1],
    ],
    'A---'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [8, 8],
      [4, 8],
      [0, 0],
      [2, 4],
    ],
    'A--B'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    4,
    [
      [2, 8],
      [4, 8],
    ],
    'A-'
  ),
  true
);

Test.assertDeepEquals(replay(4, [[2, 2]], '--'), 'Defeat');

Test.assertDeepEquals(
  replay(
    10,
    [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
    'A--'
  ),
  true
);
Test.assertDeepEquals(
  replay(
    10,
    [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
    'BBB'
  ),
  true
);
Test.assertDeepEquals(
  replay(
    10,
    [
      [2, 2],
      [2, 2],
      [2, 2],
    ],
    'CBB'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    10,
    [
      [4, 2],
      [4, 2],
      [4, 2],
    ],
    'CA-'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    10,
    [
      [4, 2],
      [4, 2],
      [4, 2],
    ],
    'A-B'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    10,
    [
      [8, 2],
      [8, 2],
      [8, 2],
    ],
    'ABBA'
  ),
  true
);
Test.assertDeepEquals(
  replay(
    10,
    [
      [8, 2],
      [8, 2],
      [8, 2],
    ],
    'ABCA'
  ),
  true
);
Test.assertDeepEquals(
  replay(
    10,
    [
      [8, 2],
      [8, 2],
      [8, 2],
    ],
    'ACBA'
  ),
  true
);

Test.assertDeepEquals(
  replay(
    10,
    [
      [8, 2],
      [0, 0],
      [0, 0],
      [4, 2],
      [0, 0],
      [8, 2],
    ],
    'A--C-A'
  ),
  true
);

function act(health, level) {
  if (VERBOSE) {
    console.log('');
    console.log('health: ' + health);
    console.log('level: ' + level.map((e) => `[${e[0]}, ${e[1]}]`));
  }
  const userSolution = fight(
    health,
    level.map((e) => e.slice())
  );
  if (VERBOSE) {
    console.log('user solution:\n');
    console.log("'" + userSolution + "'");
    console.log('');
  }
  Test.assertDeepEquals(
    replay(
      health,
      level.map((e) => e.slice()),
      userSolution
    ),
    true
  );
}

it('Short waves', () => {
  act(10, [
    [2, 2],
    [2, 2],
    [2, 2],
  ]);
  act(10, [
    [4, 2],
    [4, 2],
    [4, 2],
  ]);
  act(10, [
    [8, 2],
    [8, 2],
    [8, 2],
  ]);
  act(10, [
    [2, 2],
    [4, 2],
    [8, 2],
  ]);
  act(10, [
    [2, 4],
    [4, 6],
    [8, 10],
  ]);
  act(10, [
    [8, 2],
    [4, 2],
    [0, 0],
    [8, 2],
  ]);
  act(10, [
    [8, 2],
    [0, 0],
    [0, 0],
    [4, 2],
    [0, 0],
    [8, 2],
  ]);
  act(10, [
    [2, 4],
    [4, 6],
    [0, 0],
    [8, 10],
  ]);
  act(10, [
    [2, 8],
    [4, 8],
  ]);
  act(2, [
    [8, 2],
    [8, 2],
    [8, 1],
  ]);
});

it('Multiple short waves', () => {
  act(10, [
    [8, 2],
    [8, 2],
    [8, 2],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [8, 2],
    [8, 2],
    [8, 2],
  ]);
  act(10, [
    [2, 2],
    [2, 2],
    [2, 2],
    [0, 0],
    [0, 0],
    [0, 0],
    [4, 2],
    [4, 2],
    [4, 2],
    [0, 0],
    [0, 0],
    [2, 2],
    [2, 2],
    [2, 2],
  ]);
  act(10, [
    [8, 4],
    [8, 8],
    [8, 1],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [2, 10],
    [0, 0],
    [4, 10],
    [8, 1],
    [0, 0],
    [0, 0],
    [0, 0],
    [4, 4],
    [8, 10],
  ]);
});

it('Short waves - last breath', () => {
  act(1, [
    [2, 2],
    [2, 2],
    [2, 2],
  ]);
  act(1, [
    [4, 2],
    [4, 2],
    [4, 2],
  ]);
  act(2, [
    [8, 2],
    [8, 2],
    [8, 1],
  ]);
  act(1, [
    [2, 2],
    [4, 2],
    [8, 2],
  ]);
  act(1, [
    [2, 4],
    [4, 6],
    [8, 10],
  ]);
  act(1, [
    [8, 2],
    [4, 2],
    [0, 0],
    [8, 2],
  ]);
  act(1, [
    [8, 2],
    [0, 0],
    [0, 0],
    [4, 2],
    [0, 0],
    [8, 2],
  ]);
  act(1, [
    [4, 2],
    [4, 1],
    [4, 2],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [2, 1],
    [8, 4],
    [2, 4],
    [8, 4],
    [4, 4],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  act(100, [
    [0, 0],
    [0, 0],
    [15, 5],
    [3, 7],
    [11, 9],
    [2, 15],
    [16, 1],
    [16, 4],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [16, 3],
    [5, 9],
    [5, 8],
    [0, 0],
    [0, 0],
    [0, 0],
    [7, 4],
    [14, 13],
    [7, 15],
    [0, 0],
    [0, 0],
    [0, 0],
    [15, 13],
    [15, 16],
    [14, 1],
    [10, 4],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [1, 10],
    [4, 7],
    [5, 9],
    [1, 3],
    [0, 0],
  ]);
});
