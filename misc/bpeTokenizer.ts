const getBestPair = (arr: number[][]) => {
  const KEY_BASE = 1e6;
  const counts: Record<number, number> = {};

  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    for (let j = 0; j < s.length - 1; j++) {
      const k = s[j] * KEY_BASE + s[j + 1];
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }

  let bestKey = -1;
  let bestCount = 1;
  for (const k in counts) {
    if (counts[k] > bestCount) {
      bestCount = counts[k];
      bestKey = +k;
    }
  }
  return [Math.floor(bestKey / KEY_BASE), bestKey % KEY_BASE, bestCount];
};

const applyMerge = (
  arr: number[][],
  val1: number,
  val2: number,
  newVal: number,
): void => {
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    const n = s.length;
    if (n < 2) continue;

    let j = 0; // read index
    let w = 0; // write index

    while (j < n) {
      if (j + 1 < n && s[j] === val1 && s[j + 1] === val2) {
        s[w++] = newVal;
        j += 2; // skip the merged pair
      } else {
        s[w++] = s[j++];
      }
    }

    if (w < n) s.length = w; // truncate once at the end
  }
};

function tokenize(textPieces: string[], desiredVocabLength: number) {
  const idToToken = ['', ...new Set(textPieces.join(''))];
  const tokenIndex = Object.fromEntries(
    idToToken.map((token, id) => [token, id]),
  );

  const arr = textPieces.map((t) => [...t].map((c) => tokenIndex[c]));

  while (idToToken.length - 1 < desiredVocabLength) {
    const [aId, bId, count] = getBestPair(arr);
    if (count === 1) break;
    const newId = idToToken.push(idToToken[aId] + idToToken[bId]) - 1;
    applyMerge(arr, aId, bId, newId);
    console.log(
      `${newId}: "${idToToken[aId]}+${idToToken[bId]}" - ${count.toLocaleString()}`,
    );
  }

  return {idToToken, result: arr.flat()};
}

////////

import fs from 'fs';

const corpus =
  (' ' + fs.readFileSync('./jibberjabber/bible.txt', 'utf-8'))
    .toLowerCase()
    .replace(/[^a-z ,.?;:'"!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .match(/ ?[a-z']+|[^a-z']/g) ?? [];

const {idToToken, result} = tokenize(corpus, 1000);

console.log(
  result
    .map((t) => idToToken[t])
    .slice(0, 1000)
    .join('|'),
);

console.log(idToToken.join('|'));
