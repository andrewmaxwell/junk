const getSequenceCompletions = ([n1, t1], [n2, t2]) => {
  if (t1 !== t2 || t1 === 'z') return [];
  const [a, b] = [n1, n2].map(Number).sort((a, b) => a - b);
  if (b - a === 2) return [a + 1 + t1];
  if (b - a !== 1) return [];
  if (a === 1) return [a + 2 + t1];
  if (a === 8) return [a - 1 + t1];
  return [a - 1 + t1, a + 2 + t1];
};

const solution = (tiles) => {
  const hand = {};
  for (const t of tiles.split(' ')) hand[t] = (hand[t] || 0) + 1;

  const result = [];

  // 7 pairs
  const noPairs = Object.entries(hand).filter((p) => p[1] % 2);
  if (noPairs.length === 1) result.push(noPairs[0][0]);

  const q = [{curr: hand, melds: 4, pairs: 1}];
  for (const {curr, melds, pairs} of q) {
    if (melds) {
      for (const p in curr) {
        // three of a kind
        if (curr[p] < 3) continue;
        const newHand = {...curr};
        newHand[p] -= 3;
        q.push({curr: newHand, melds: melds - 1, pairs});
      }

      // sequential
      for (const t of 'psm') {
        for (let i = 1; i < 8; i++) {
          if (!curr[i + t] || !curr[i + 1 + t] || !curr[i + 2 + t]) continue;
          const newHand = {...curr};
          newHand[i + t]--;
          newHand[i + 1 + t]--;
          newHand[i + 2 + t]--;
          q.push({curr: newHand, melds: melds - 1, pairs});
        }
      }
    }

    if (pairs) {
      for (const p in curr) {
        if (curr[p] < 2) continue;
        const newHand = {...curr};
        newHand[p] -= 2;
        q.push({curr: newHand, melds, pairs: pairs - 1});
      }
    }

    if (melds + pairs === 1) {
      const arr = Object.entries(curr).filter((p) => p[1]);
      if (arr.length === 1) result.push(arr[0][0]);
      else result.push(...getSequenceCompletions(arr[0][0], arr[1][0]));
    }
  }

  return [...new Set(result)]
    .filter((p) => hand[p] !== 4)
    .sort((a, b) => 'psmz'.indexOf(a[1]) - 'psmz'.indexOf(b[1]) || a[0] - b[0])
    .join(' ');
};

// You may add more custom tests here :)
var cases = [
  ['2p 2p 3p 3p 4p 4p 5p 5p 7m 7m 8m 8m 8m', '2p 5p 7m 8m'],
  ['1p 1p 3p 3p 4p 4p 5p 5p 6p 6p 7p 7p 9p', '9p'],
  ['6s 7s 8s 1m 1m 1m 7m 7m 7m 8m 9m 9m 9m', '6m 7m 8m 9m'],
  ['2p 2p 2p 3p 3p 3p 3p 4p 4p 4p 4p 5p 6p', '1p 2p 5p 6p 7p'],
];

const {Test} = require('./test');
for (let [hand, expected] of cases) Test.assertEquals(solution(hand), expected);

// var cases = [
//   ['2s', '3p', []],
//   ['3z', '4z', []],
//   ['1s', '2s', ['3s']],
//   ['2s', '3s', ['1s', '4s']],
//   ['2s', '4s', ['3s']],
//   ['8s', '9s', ['7s']],
//   ['2s', '5s', []],
// ];

// const {Test} = require('./test');
// for (let [a, b, expected] of cases)
//   Test.assertEquals(getSequenceCompletions(a, b), expected);
