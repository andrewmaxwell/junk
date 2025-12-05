import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, resolve} from 'node:path';

export class Tokenizer {
  private pathToCorpus: string;
  private idToToken: string[];
  private tokens: Int32Array;
  private mergeList: number[][];
  constructor(pathToCorpus: string, desiredVocabLength = 1024) {
    const corpus = readFileSync(pathToCorpus, 'utf-8');
    const pieces = this.preprocess(corpus);
    const {idToToken, result, mergeList} = buildTokens(
      pieces,
      desiredVocabLength,
    );
    this.pathToCorpus = pathToCorpus;
    this.idToToken = idToToken;
    this.tokens = Int32Array.from(result);
    this.mergeList = mergeList;
  }
  preprocess(text: string) {
    // return (
    //   (' ' + text)
    //     .toLowerCase()
    //     .replace(/[^a-z ,.?;:'"!-]/g, ' ') // replace special chars with space
    //     .replace(/\s+/g, ' ') // collapse whitespace
    //     .match(/ ?[a-z']+|[^a-z']/g) ?? [] // separate words from punctuation
    // );
    return (
      text.match(
        /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu,
      ) ?? []
    );
  }
  encode(text: string) {
    const arr = textPiecesToTokenIds(this.preprocess(text), this.idToToken);
    this.mergeList.forEach(([a, b, c]) => applyMerge(arr, a, b, c));
    return arr.flat();
  }
  decode(contextIds: number[]) {
    return contextIds.map((id) => this.idToToken[id] ?? '').join('');
  }
  getTrainingTarget(contextIds: Int32Array) {
    const len = contextIds.length;
    const idx = Math.floor(Math.random() * (this.tokens.length - len - 1));
    for (let j = 0; j < len; j++) contextIds[j] = this.tokens[idx + j];
    return this.tokens[idx + len];
  }
  saveToDisk() {
    const vocabLen = this.idToToken.length;
    const dir = resolve('.', 'languageModel');
    const fileName = `tokenizer_${basename(this.pathToCorpus)}_${vocabLen}.bin`;
    mkdirSync(dir, {recursive: true});

    const encoder = new TextEncoder();
    const tokenLengths = new Uint32Array(vocabLen);
    const encodedTokens: Uint8Array[] = new Array(vocabLen);
    let totalStringBytes = 0;
    for (let i = 0; i < vocabLen; i++) {
      const bytes = encoder.encode(this.idToToken[i]);
      encodedTokens[i] = bytes;
      tokenLengths[i] = bytes.length;
      totalStringBytes += bytes.length;
    }

    const mergeCount = this.mergeList.length;
    const mergeFlat = new Uint32Array(mergeCount * 3);
    for (let i = 0; i < mergeCount; i++) {
      const base = i * 3;
      const [a, b, c] = this.mergeList[i];
      mergeFlat[base] = a;
      mergeFlat[base + 1] = b;
      mergeFlat[base + 2] = c;
    }

    const header = new Uint32Array([
      vocabLen,
      this.tokens.length,
      mergeCount,
      totalStringBytes,
    ]);

    const stringBytes = new Uint8Array(totalStringBytes);
    let strOffset = 0;
    for (let i = 0; i < vocabLen; i++) {
      const bytes = encodedTokens[i];
      stringBytes.set(bytes, strOffset);
      strOffset += bytes.length;
    }

    const segments = [
      new Uint8Array(header.buffer, header.byteOffset, header.byteLength),
      new Uint8Array(
        this.tokens.buffer,
        this.tokens.byteOffset,
        this.tokens.byteLength,
      ),
      new Uint8Array(
        mergeFlat.buffer,
        mergeFlat.byteOffset,
        mergeFlat.byteLength,
      ),
      new Uint8Array(
        tokenLengths.buffer,
        tokenLengths.byteOffset,
        tokenLengths.byteLength,
      ),
      stringBytes,
    ];

    let totalBytes = 0;
    for (const segment of segments) totalBytes += segment.length;

    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const segment of segments) {
      out.set(segment, offset);
      offset += segment.length;
    }

    const filePath = resolve(dir, fileName);
    writeFileSync(filePath, out);
    return filePath;
  }
  static loadFromDisk(pathToCorpus: string, desiredVocabLength = 1024) {
    const fileName = `tokenizer_${basename(pathToCorpus)}_${desiredVocabLength}.bin`;
    const filePath = resolve('.', 'languageModel', fileName);

    if (existsSync(filePath)) {
      console.log(`loading ${filePath}`);
      const bytes = readFileSync(filePath);
      const buffer = bytes.buffer;
      const baseOffset = bytes.byteOffset;
      const header = new Uint32Array(buffer, baseOffset, 4);
      const [vocabLen, tokensLen, mergeCount, stringBytesLen] = header;

      if (vocabLen === desiredVocabLength) {
        let offset = baseOffset + header.byteLength;

        const tokens = new Int32Array(buffer, offset, tokensLen);
        offset += tokens.byteLength;

        const mergeFlat = new Uint32Array(buffer, offset, mergeCount * 3);
        offset += mergeFlat.byteLength;

        const tokenLengths = new Uint32Array(buffer, offset, vocabLen);
        offset += tokenLengths.byteLength;

        const stringBytes = new Uint8Array(buffer, offset, stringBytesLen);
        const decoder = new TextDecoder();
        const idToToken = new Array<string>(vocabLen);

        let strOffset = 0;
        for (let i = 0; i < vocabLen; i++) {
          const len = tokenLengths[i];
          idToToken[i] = decoder.decode(
            stringBytes.subarray(strOffset, strOffset + len),
          );
          strOffset += len;
        }

        const mergeList: number[][] = new Array(mergeCount);
        for (let i = 0; i < mergeCount; i++) {
          const base = i * 3;
          mergeList[i] = [
            mergeFlat[base],
            mergeFlat[base + 1],
            mergeFlat[base + 2],
          ];
        }

        const tokenizer = Object.create(Tokenizer.prototype) as Tokenizer;
        tokenizer.idToToken = idToToken;
        tokenizer.tokens = tokens;
        tokenizer.mergeList = mergeList;
        console.log(`${tokens.length.toLocaleString()} tokens in corpus`);
        return tokenizer;
      }
    }

    const t = new Tokenizer(pathToCorpus, desiredVocabLength);
    t.saveToDisk();
    return t;
  }
}

function getBestPair(arr: number[][]) {
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
}

function applyMerge(
  arr: number[][],
  val1: number,
  val2: number,
  newVal: number,
): void {
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
}

function textPiecesToTokenIds(textPieces: string[], idToToken: string[]) {
  const tokenIndex = Object.fromEntries(
    idToToken.map((token, id) => [token, id]),
  );
  return textPieces.map((t) => [...t].map((c) => tokenIndex[c]));
}

function buildTokens(textPieces: string[], desiredVocabLength: number) {
  const unique = new Set<string>();
  for (const w of textPieces) {
    for (const t of w) unique.add(t);
  }
  const idToToken = ['', ...unique];
  const arr = textPiecesToTokenIds(textPieces, idToToken);
  const mergeList: number[][] = [];

  while (idToToken.length < desiredVocabLength) {
    const [aId, bId, count] = getBestPair(arr);
    if (count === 1) break;
    const newId = idToToken.push(idToToken[aId] + idToToken[bId]) - 1;
    applyMerge(arr, aId, bId, newId);
    mergeList.push([aId, bId, newId]);
    console.log(
      `${newId}: "${idToToken[aId]}+${idToToken[bId]}" • ${count.toLocaleString()}`,
    );
  }

  return {idToToken, result: arr.flat(), mergeList};
}
