export class Tokenizer {
  private idToToken: string[];
  private mergeList: number[][];
  private vocabSize: number;
  corpusTokens: number[];
  constructor(desiredVocabLength = 1024) {
    this.idToToken = [];
    this.mergeList = [];
    this.corpusTokens = [];
    this.vocabSize = desiredVocabLength;
  }
  async load(corpusPath: string, log: (msg: string) => void) {
    const storageKey = getStorageKey(corpusPath, this.vocabSize);
    const persisted = readPersistedTokenizer(storageKey);
    const isPersisted = persisted !== null;
    if (isPersisted && persisted) {
      log('Loading cached tokenizer');
      this.idToToken = persisted.idToToken;
      this.mergeList = persisted.mergeList;
      this.corpusTokens = persisted.corpusTokens;
    } else {
      log('Fetching corpus.txt');
      const response = await fetch(corpusPath);
      if (!response.ok) throw new Error('Failed to fetch corpus');

      const text = await response.text();
      log(`Loaded ${text.length.toLocaleString()} chars`);

      log('Tokenizing');
      await this.train(text, log);
      log(
        `Corpus contains ${this.corpusTokens.length.toLocaleString()} tokens.`,
      );
      persistTokenizer(storageKey, {
        idToToken: this.idToToken,
        mergeList: this.mergeList,
        corpusTokens: this.corpusTokens,
      });
    }
  }
  async train(corpus: string, onProgress: (msg: string) => void) {
    const textPieces = preprocess(corpus);

    const unique = new Set<string>();
    for (const w of textPieces) {
      for (const t of w) unique.add(t);
    }
    const idToToken = ['', ...unique];
    const arr = textPiecesToTokenIds(textPieces, idToToken);
    const mergeList: number[][] = [];
    const KEY_BASE = 1e6;

    while (idToToken.length < this.vocabSize) {
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

      const aId = Math.floor(bestKey / KEY_BASE);
      const bId = bestKey % KEY_BASE;

      if (bestCount === 1) break;
      const newId = idToToken.push(idToToken[aId] + idToToken[bId]) - 1;
      applyMerge(arr, aId, bId, newId);
      mergeList.push([aId, bId, newId]);
      onProgress(
        `Token ${newId}: "${idToToken[aId]}+${idToToken[bId]}" occurred ${bestCount.toLocaleString()} times`,
      );

      // don't freeze up the UI
      if (idToToken.length % 10 === 0) {
        await new Promise(requestAnimationFrame);
      }
    }

    this.idToToken = idToToken;
    this.corpusTokens = arr.flat();
    this.mergeList = mergeList;
  }
  encode(text: string) {
    const arr = textPiecesToTokenIds(preprocess(text), this.idToToken);
    this.mergeList.forEach(([a, b, c]) => applyMerge(arr, a, b, c));
    return arr.flat();
  }
  decode(contextIds: number[]) {
    return contextIds.map((id) => this.idToToken[id] ?? '').join('');
  }
}

function preprocess(text: string) {
  return (
    text.match(
      /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu,
    ) ?? []
  );
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

const TOKENIZER_CACHE_VERSION = 'v1';

type PersistedTokenizer = {
  idToToken: string[];
  mergeList: number[][];
  corpusTokens: number[];
};

function getStorageKey(corpusPath: string, vocabSize: number) {
  return `tokenizer:${TOKENIZER_CACHE_VERSION}:${corpusPath}:${vocabSize}`;
}

function readPersistedTokenizer(key: string): PersistedTokenizer | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedTokenizer>;
    if (
      Array.isArray(parsed.idToToken) &&
      Array.isArray(parsed.mergeList) &&
      Array.isArray(parsed.corpusTokens)
    ) {
      return {
        idToToken: parsed.idToToken,
        mergeList: parsed.mergeList as number[][],
        corpusTokens: parsed.corpusTokens as number[],
      };
    }
  } catch (err) {
    console.warn('Failed to read persisted tokenizer', err);
  }
  return null;
}

function persistTokenizer(key: string, tokenizer: PersistedTokenizer) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(tokenizer));
  } catch (err) {
    console.warn('Failed to persist tokenizer', err);
  }
}
