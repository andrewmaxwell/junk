import {readFileSync} from 'fs';

const startingWord = 'tune';
const endingWord = 'poop';

const wordSet = new Set(
  readFileSync('./enable1.txt', 'utf-8')
    .split('\n')
    .filter((w) => w.length === 4 && w !== 'pone'),
);

const adjacencies = {};
for (const w of wordSet) {
  adjacencies[w] = [];
  for (let i = 0; i < w.length; i++) {
    for (const t of 'abcdefghijklmnopqrstuvwxyz') {
      const arr = [...w];
      arr[i] = t;
      const potentialWord = arr.join('');
      if (
        potentialWord !== w &&
        wordSet.has(potentialWord) &&
        !adjacencies[w].includes(potentialWord)
      ) {
        adjacencies[w].push(potentialWord);
      }
    }
  }
}

const queue = [[startingWord]];
const visited = new Set();

while (queue.length) {
  const current = queue.shift();
  const last = current[current.length - 1];
  if (last === endingWord) {
    console.log(current);
    break;
  }

  visited.add(last);
  for (const w of adjacencies[last]) {
    if (!visited.has(w)) queue.push([...current, w]);
  }
}
