// const isValid = (str, words, i, len) => {
//   words = [...words];
//   const numWords = words.length;
//   for (let j = 0; j < numWords; j++) {
//     const w = str.slice(i + j * len, i + (j + 1) * len);
//     const index = words.indexOf(w);
//     if (index === -1) return false;
//     words.splice(index, 1);
//   }
//   return !words.length;
// };

// const findSubstring = (str, words) => {
//   const len = words[0].length;
//   const result = [];
//   for (let i = 0; i <= str.length - len * words.length; i++) {
//     if (isValid(str, words, i, len)) result.push(i);
//   }
//   return result;
// };

const isValid = (str, words, i, len, counts) => {
  const seen = {};
  for (let j = 0; j < words.length; j++) {
    const word = str.slice(i + j * len, i + (j + 1) * len);
    if (word in counts) {
      seen[word] = (seen[word] || 0) + 1;
      if (seen[word] > counts[word]) return false;
    } else return false;
  }
  return true;
};

const findSubstring = (str, words) => {
  const counts = {};
  for (const word of words) {
    counts[word] = (counts[word] || 0) + 1;
  }
  const result = [];
  const len = words[0].length;

  for (let i = 0; i <= str.length - words.length * len; i++) {
    if (isValid(str, words, i, len, counts)) result.push(i);
  }
  return result;
};

const {Test} = require('./test.js');

Test.assertDeepEquals(
  findSubstring('barfoothefoobarman', ['foo', 'bar']),
  [0, 9]
);
Test.assertDeepEquals(
  findSubstring('wordgoodgoodgoodbestword', ['word', 'good', 'best', 'word']),
  []
);
Test.assertDeepEquals(
  findSubstring('barfoofoobarthefoobarman', ['bar', 'foo', 'the']),
  [6, 9, 12]
);
Test.assertDeepEquals(
  findSubstring('wordgoodgoodgoodbestword', ['word', 'good', 'best', 'good']),
  [8]
);
Test.assertDeepEquals(
  findSubstring('lingmindraboofooowingdingbarrwingmonkeypoundcake', [
    'fooo',
    'barr',
    'wing',
    'ding',
    'wing',
  ]),
  [13]
);
