export class Tokenizer {
  private idToToken: string[];
  private mergeList: number[][];
  constructor() {
    this.idToToken = [];
    this.mergeList = [];
  }
  async load(jsonPath: string) {
    const response = await fetch(jsonPath);
    if (!response.ok)
      throw new Error(`Failed to fetch tokenizer at ${jsonPath}`);
    const parsed = (await response.json()) as {
      initialVocab: string[];
      merges: [number, number][];
    };

    // Rebuild idToToken in the same order tokenize.ts produced it
    const idToToken: string[] = [...parsed.initialVocab];
    const mergeList: number[][] = [];

    for (const [a, b] of parsed.merges) {
      const newToken = (idToToken[a] ?? '') + (idToToken[b] ?? '');
      idToToken.push(newToken);
      mergeList.push([a, b, idToToken.length - 1]); // store new token id
    }

    this.idToToken = idToToken;
    this.mergeList = mergeList;
  }
  encode(text: string) {
    const textPieces = preprocess(text);
    const tokenIndex = Object.fromEntries(
      this.idToToken.map((token, id) => [token, id]),
    );
    const arr = textPieces.map((t) => [...t].map((c) => tokenIndex[c]));
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
