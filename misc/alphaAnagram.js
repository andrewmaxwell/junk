// https://www.codewars.com/kata/53e57dada0cb0400ba000688/train/javascript

const factorial = (n) => {
  let r = 1;
  for (let i = 1; i <= n; i++) r *= i;
  return r;
};

const listPosition = (str) => {
  let total = 1;
  let counts = {};
  for (const t of str) counts[t] = (counts[t] || 0) + 1;
  for (let i = 0; i < str.length; i++) {
    for (const t in counts) {
      if (!counts[t] || t >= str[i]) continue;
      let v = factorial(str.length - 1 - i);
      for (const x in counts) {
        v /= factorial(counts[x] - (x === t));
      }
      total += v;
    }
    counts[str[i]]--;
  }
  return total;
};

//////////////////////
const {Test} = require('./test');
var testValues = {
  A: 1,
  ABAB: 2,
  AAAB: 1,
  BAAA: 4,
  QUESTION: 24572,
  BOOKKEEPER: 10743,
  ZAAAABBBCCCDDEEEEFFFGHIJKK: 779200928906399800000,
};

for (var word in testValues) {
  Test.assertEquals(listPosition(word), testValues[word]);
}
