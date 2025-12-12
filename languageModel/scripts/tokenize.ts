import fs from 'fs';

const VOCAB_SIZE = 4096; // must match in src/main.ts
const INPUT_FILE = 'corpus.txt';
const TRAIN_FILE = './public/train.bin'; // Binary file for the LLM
const TOKENIZER_FILE = './public/tokenizer.json'; // Metadata to reconstruct vocab

function main() {
  const corpus = fs.readFileSync(INPUT_FILE, 'utf-8');

  // 1. Tokenize text into words (Preserving your regex)
  const textPieces =
    corpus
      .replace(/\s+/, ' ')
      .replace(/[^A-Za-z .,;:?'"()!-]/g, ' ') // english only for now
      .replace(/\s+/, ' ')
      .match(
        /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu,
      ) ?? [];

  const uniqueChars = new Set<string>();
  for (const w of textPieces) {
    for (const c of w) uniqueChars.add(c);
  }

  // Determine base vocab: Special Tokens + Unique Characters
  const initialVocab = [...uniqueChars];
  const idToToken = [...initialVocab];
  const tokenToId = new Map(idToToken.map((t, i) => [t, i]));

  // 3. Build Linked List Structure (Uint16 is sufficient for < 65k vocab)
  let totalLength = 0;
  for (const p of textPieces) totalLength += p.length;

  const tokens = new Int32Array(totalLength);
  const next = new Int32Array(totalLength);
  const prev = new Int32Array(totalLength);
  const wordStartIndices: number[] = [];

  let writeIdx = 0;
  for (const piece of textPieces) {
    wordStartIndices.push(writeIdx);
    const start = writeIdx;

    for (const char of piece) {
      // Map char to ID. If somehow missing, fall back to 0 (<unk>)
      tokens[writeIdx] = tokenToId.get(char) ?? 0;
      prev[writeIdx] = writeIdx - 1;
      next[writeIdx] = writeIdx + 1;
      writeIdx++;
    }

    prev[start] = -1;
    next[writeIdx - 1] = -1;
  }

  // 4. Initialize Statistics
  const stats = new Map<number, {count: number; indices: number[]}>();

  function getPairKey(a: number, b: number) {
    return (a << 17) | b;
  }

  function updateStats(idx: number, delta: number) {
    if (next[idx] === -1) return;
    const key = getPairKey(tokens[idx], tokens[next[idx]]);
    let entry = stats.get(key);

    if (!entry) {
      entry = {count: 0, indices: []};
      stats.set(key, entry);
    }
    entry.count += delta;
    if (delta > 0) entry.indices.push(idx);
    if (entry.count <= 0 && delta < 0) stats.delete(key);
  }

  for (let i = 0; i < totalLength; i++) {
    if (next[i] !== -1) updateStats(i, 1);
  }

  // 5. Main BPE Loop
  const startTime = Date.now();
  const totalMergesNeeded = Math.max(VOCAB_SIZE - idToToken.length, 1);
  const logProgress = () => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    const progress =
      ((idToToken.length - initialVocab.length) / totalMergesNeeded) * 100;
    console.log(
      `[progress] ${Math.min(progress, 100).toFixed(1)}% ` +
        `(${idToToken.length}/${VOCAB_SIZE}) after ${elapsedSec.toFixed(1)}s`,
    );
  };
  const mergeList: number[][] = [];

  while (idToToken.length < VOCAB_SIZE) {
    let bestKey = -1;
    let bestCount = 0;

    for (const [key, entry] of stats) {
      if (entry.count > bestCount) {
        bestCount = entry.count;
        bestKey = key;
      }
    }

    if (bestCount < 2) break;

    const pairA = bestKey >> 17;
    const pairB = bestKey & 0x1ffff;
    const newId = idToToken.length;

    idToToken.push(idToToken[pairA] + idToToken[pairB]);
    mergeList.push([pairA, pairB]);

    const indices = stats.get(bestKey)!.indices;

    for (const idx of indices) {
      if (
        tokens[idx] !== pairA ||
        next[idx] === -1 ||
        tokens[next[idx]] !== pairB
      )
        continue;

      const nextIdx = next[idx];
      const prevIdx = prev[idx];
      const afterNextIdx = next[nextIdx];

      if (prevIdx !== -1) updateStats(prevIdx, -1);
      if (afterNextIdx !== -1) updateStats(nextIdx, -1);

      tokens[idx] = newId;
      next[idx] = afterNextIdx;
      if (afterNextIdx !== -1) prev[afterNextIdx] = idx;

      if (prevIdx !== -1) updateStats(prevIdx, 1);
      if (afterNextIdx !== -1) updateStats(idx, 1);
    }
    stats.delete(bestKey);

    if (mergeList.length % 25 === 0) logProgress();
  }
  logProgress();

  // 6. Save Corpus as Binary (train.bin)
  // We extract the valid tokens from the linked list structure
  const compressedData = new Uint16Array(
    wordStartIndices.length + tokens.length,
  ); // Safe over-allocation
  let outputIdx = 0;

  for (const startIdx of wordStartIndices) {
    let curr = startIdx;
    while (curr !== -1) {
      compressedData[outputIdx++] = tokens[curr];
      curr = next[curr];
    }
  }

  // Slice to exact length and save
  const finalBuffer = Buffer.from(compressedData.buffer, 0, outputIdx * 2);
  fs.writeFileSync(TRAIN_FILE, finalBuffer);
  console.log(
    `Saved ${TRAIN_FILE} (${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB)`,
  );

  // 7. Save Tokenizer Data (tokenizer.json)
  const tokenizerData = {
    vocabSize: idToToken.length,
    initialVocab: [...uniqueChars], // The base characters
    merges: mergeList, // The instructions to rebuild the rest
  };

  fs.writeFileSync(TOKENIZER_FILE, JSON.stringify(tokenizerData));
  console.log(`Saved ${TOKENIZER_FILE}`);
}

main();
