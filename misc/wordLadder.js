function isAdjacent(word1, word2) {
  let numDifferences = 0;
  for (let i = 0; i < word1.length && numDifferences < 2; i++) {
    if (word1[i] !== word2[i]) numDifferences++;
  }
  return numDifferences === 1;
}

function getNeighbors(wordList) {
  const neighbors = Object.fromEntries(wordList.map((w) => [w, []]));
  for (let i = 1; i < wordList.length; i++) {
    for (let j = 0; j < i; j++) {
      if (!isAdjacent(wordList[i], wordList[j])) continue;
      neighbors[wordList[i]].push(wordList[j]);
      neighbors[wordList[j]].push(wordList[i]);
    }
  }
  return neighbors;
}

function getTransformation(startWord, endWord, wordList) {
  const neighbors = getNeighbors([startWord, ...wordList]);
  const queue = [[startWord]];
  for (const currentArr of queue) {
    for (const word of neighbors[currentArr[currentArr.length - 1]]) {
      if (word === endWord) return [...currentArr, word];
      queue.push([...currentArr, word]);
    }
  }
}

// TEST

const testResult1 = getTransformation(
  'hit',
  'cog',
  ['cog', 'dog', 'dot', 'hot', 'log', 'lot'].reverse()
);
const expected1 = ['hit', 'hot', 'lot', 'log', 'cog'];
console.log(
  'testResult1: ',
  testResult1,
  testResult1.join() === expected1.join() ? 'PASS' : 'FAIL'
);
