/** @param {string} str */
function getTrigrams(str) {
  const padded = `  ${str.toLowerCase()} `;
  const trigrams = new Set();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.slice(i, i + 3));
  }
  return trigrams;
}

/** @type {(a: string, b: string) => number} */
function trigramSimilarity(a, b) {
  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);

  const union = new Set([...trigramsA, ...trigramsB]);
  if (!union.size) return 0;

  let intersectionCount = 0;

  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) {
      intersectionCount++;
    }
  }

  return intersectionCount / union.size;
}

import fs from 'fs';

const searchStr = 'abraham verily';

const results = fs
  .readFileSync('./jibberjabber/bible.txt', 'utf8')
  .split(/[.!?]\s+(?=[A-Z])/)
  .map((s) => ({
    s,
    v: trigramSimilarity(s.toLowerCase(), searchStr),
  }))
  .sort((a, b) => b.v - a.v)
  .map((s) => `${s.s} (${Math.round(s.v * 100)}%)`)
  .slice(0, 32);

console.log(results);
