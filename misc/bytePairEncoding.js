import fs from 'fs';

let text = fs
  .readFileSync('jibberjabber/bible.txt', 'utf-8')
  .slice(0, 100000)
  .toLowerCase()
  .replace(/[^a-z ]/g, '');
const origLen = text.length;

const lookup = {};
const expandRec = (c) =>
  lookup[c] ? [...lookup[c]].map(expandRec).join('') : c;
const expand = (text) =>
  [...text].map((c) => `[${lookup[c] ? expandRec(c) : c}]`).join('');

for (let n = 0; n < 128; n++) {
  const pairCounts = {};
  let maxPair;
  for (let i = 0; i < text.length - 1; i++) {
    // if (text[i] === ' ' || text[i + 1] === ' ') continue;
    const pair = text.slice(i, i + 2);
    pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    if (!maxPair || pairCounts[pair] > pairCounts[maxPair]) maxPair = pair;
  }
  if (pairCounts[maxPair] < 2) break;
  const placeholder = String.fromCharCode(128 + n);
  lookup[placeholder] = maxPair;
  text = text.replaceAll(maxPair, placeholder);

  console.log(
    n,
    expand(maxPair),
    '(' + Math.round((text.length / origLen) * 1000) / 10 + '%)'
  );
}

console.log(expand(text.slice(0, 100)));
