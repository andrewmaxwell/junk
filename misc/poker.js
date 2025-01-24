// const rankings = [
//   () => true,
//   has(2),
//   hasTwoPairs,
//   has(3),
//   hasStraight,
//   hasFlush,
//   hasFullHouse,
//   has(4),
//   hasStraightFlush,
// ];

const score = (hand) => {
  const valueCounts = {};
  const suitCounts = {};
  let highest = -Infinity;
  for (const [v, s] of hand) {
    valueCounts[v] = (valueCounts[v] || 0) + 1;
    suitCounts[s] = (suitCounts[s] || 0) + 1;
    highest = Math.max(+v, highest);
  }
  const numSameSuit = Math.max(...Object.values(suitCounts));
  const isStraight =
    Object.keys(valueCounts).length === 5 &&
    Object.keys(valueCounts).sort((a, b) => a - b);

  if (numSameSuit === 5) return [8, highest]; // straight flush
};

const Result = {win: 1, loss: 2, tie: 3};

const compare = (a, b) => {
  const aScore = score(a);
  const bScore = score(b);
  const r = aScore[0] - bScore[0] || aScore[1] - bScore[1];
  return Result[r > 0 ? 'win' : r < 0 ? 'loss' : 'tie'];
};

class PokerHand {
  constructor(str) {
    this.hand = str.split(' ');
  }
  compareWith({hand}) {
    return compare(this.hand, hand);
  }
}

import {Test} from './test.js';
function assert(expected, player, opponent) {
  var p = new PokerHand(player);
  var o = new PokerHand(opponent);
  Test.assertEquals(p.compareWith(o), expected);
}
it('Highest straight flush wins', function () {
  assert(Result.loss, '2H 3H 4H 5H 6H', 'KS AS TS QS JS');
});
it('Straight flush wins of 4 of a kind', function () {
  assert(Result.win, '2H 3H 4H 5H 6H', 'AS AD AC AH JD');
});
it('Highest 4 of a kind wins', function () {
  assert(Result.win, 'AS AH 2H AD AC', 'JS JD JC JH 3D');
});
it('4 Of a kind wins of full house', function () {
  assert(Result.loss, '2S AH 2H AS AC', 'JS JD JC JH AD');
});
it('Full house wins of flush', function () {
  assert(Result.win, '2S AH 2H AS AC', '2H 3H 5H 6H 7H');
});
it('Highest flush wins', function () {
  assert(Result.win, 'AS 3S 4S 8S 2S', '2H 3H 5H 6H 7H');
});
it('Flush wins of straight', function () {
  assert(Result.win, '2H 3H 5H 6H 7H', '2S 3H 4H 5S 6C');
});
it('Equal straight is tie', function () {
  assert(Result.tie, '2S 3H 4H 5S 6C', '3D 4C 5H 6H 2S');
});
it('Straight wins of three of a kind', function () {
  assert(Result.win, '2S 3H 4H 5S 6C', 'AH AC 5H 6H AS');
});
it('3 Of a kind wins of two pair', function () {
  assert(Result.loss, '2S 2H 4H 5S 4C', 'AH AC 5H 6H AS');
});
it('2 Pair wins of pair', function () {
  assert(Result.win, '2S 2H 4H 5S 4C', 'AH AC 5H 6H 7S');
});
it('Highest pair wins', function () {
  assert(Result.loss, '6S AD 7H 4S AS', 'AH AC 5H 6H 7S');
});
it('Pair wins of nothing', function () {
  assert(Result.loss, '2S AH 4H 5S KC', 'AH AC 5H 6H 7S');
});
it('Highest card loses', function () {
  assert(Result.loss, '2S 3H 6H 7S 9C', '7H 3C TH 6H 9S');
});
it('Highest card wins', function () {
  assert(Result.win, '4S 5H 6H TS AC', '3S 5H 6H TS AC');
});
it('Equal cards is tie', function () {
  assert(Result.tie, '2S AH 4H 5S 6C', 'AD 4C 5H 6H 2C');
});
