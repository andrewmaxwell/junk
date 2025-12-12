// src/Tokenizer.ts

type TokenizerJSON = {
  vocabSize: number;
  unkId: number;
  unkToken: string;
  idToToken: string[];
  merges: [number, number][];
};

export class Tokenizer {
  readonly vocabSize: number;
  readonly unkId: number;
  readonly unkToken: string;

  private idToToken: string[];
  private merges: [number, number][];

  private initialVocabSize: number;
  private charToId: Map<string, number>;
  private mergeTriples: [number, number, number][]; // [a, b, newId]

  private constructor(json: TokenizerJSON) {
    // Basic validations to prevent silent corruption
    if (
      !json ||
      !Array.isArray(json.idToToken) ||
      !Array.isArray(json.merges)
    ) {
      throw new Error('Invalid tokenizer JSON');
    }
    if (json.vocabSize !== json.idToToken.length) {
      throw new Error(
        `Invalid tokenizer: vocabSize (${json.vocabSize}) != idToToken.length (${json.idToToken.length})`,
      );
    }
    if (json.unkId < 0 || json.unkId >= json.idToToken.length) {
      throw new Error(`Invalid tokenizer: unkId out of range (${json.unkId})`);
    }
    if (json.idToToken[json.unkId] !== json.unkToken) {
      throw new Error(
        `Invalid tokenizer: idToToken[unkId] != unkToken (${json.idToToken[json.unkId]} != ${json.unkToken})`,
      );
    }

    this.idToToken = json.idToToken;
    this.merges = json.merges;

    this.vocabSize = json.idToToken.length;
    this.unkId = json.unkId;
    this.unkToken = json.unkToken;

    this.initialVocabSize = this.idToToken.length - this.merges.length;
    if (this.initialVocabSize <= 0) {
      throw new Error(
        `Invalid tokenizer: initialVocabSize=${this.initialVocabSize}`,
      );
    }

    // Initial vocab should be single-character tokens (plus <unk> at unkId)
    this.charToId = new Map<string, number>();
    for (let i = 0; i < this.initialVocabSize; i++) {
      const tok = this.idToToken[i];
      if (tok.length === 1) this.charToId.set(tok, i);
    }

    // Precompute merge triples for fast encode()
    this.mergeTriples = this.merges.map(([a, b], i) => [
      a,
      b,
      this.initialVocabSize + i,
    ]);
  }

  // ---------- Public API ----------

  static async loadFromUrl(url: string): Promise<Tokenizer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch tokenizer: ${url}`);
    const json = (await res.json()) as TokenizerJSON;
    return new Tokenizer(json);
  }

  toJSON(): TokenizerJSON {
    return {
      vocabSize: this.idToToken.length,
      unkId: this.unkId,
      unkToken: this.unkToken,
      idToToken: this.idToToken,
      merges: this.merges,
    };
  }

  encode(text: string): number[] {
    const pieces = Tokenizer.preprocess(text);
    const words = this.encodePreprocessedPiecesToWords(pieces);

    const out: number[] = [];
    for (const w of words) for (const t of w) out.push(t);
    return out;
  }

  /** Convenience for writing binary corpora or fast browser-side generation outputs. */
  encodeToUint16(text: string): Uint16Array {
    const pieces = Tokenizer.preprocess(text);
    const words = this.encodePreprocessedPiecesToWords(pieces);

    let total = 0;
    for (const w of words) total += w.length;

    const out = new Uint16Array(total);
    let k = 0;
    for (const w of words) {
      out.set(w, k);
      k += w.length;
    }
    return out;
  }

  decode(ids: ArrayLike<number>): string[] {
    const parts = new Array<string>(ids.length);
    for (let i = 0; i < ids.length; i++) {
      parts[i] = this.idToToken[ids[i]] ?? '';
    }
    return parts;
  }

  /**
   * Train BPE on `corpus` and return:
   * - tokenizer (contains vocab + merges)
   * - tokens: final merged token ids for the full corpus, ready to write to train.bin
   *
   * NOTE: We keep fast linked-list extraction for train.bin (O(N)) so the script
   * doesn't appear to "hang" at the end. Consistency with runtime encode() is ensured
   * by (a) a critical adjacency guard and (b) deterministic handling of overlapping
   * merges (only relevant when pairA === pairB).
   */
  static trainFromText(
    corpus: string,
    vocabSize: number,
    opts?: {
      unkToken?: string;
      onProgress?: (msg: string) => void;
    },
  ): {tokenizer: Tokenizer; tokens: Uint16Array} {
    if (vocabSize < 8) throw new Error('vocabSize too small');
    if (vocabSize > 0xffff) {
      throw new Error(
        `vocabSize=${vocabSize} exceeds Uint16 capacity; switch token arrays to Uint32Array and update pair keying.`,
      );
    }

    const unkToken = opts?.unkToken ?? '<unk>';
    const log = (msg: string) => opts?.onProgress?.(msg);

    const pieces = Tokenizer.preprocess(corpus);

    // Build initial vocab: <unk> then all unique characters (sorted for determinism)
    const charSet = new Set<string>();
    for (const p of pieces) for (const ch of p) charSet.add(ch);
    charSet.delete(unkToken);

    const chars = Array.from(charSet);
    chars.sort();

    const idToToken: string[] = [unkToken, ...chars];
    const unkId = 0;

    if (idToToken.length >= vocabSize) {
      throw new Error(
        `Too many unique chars (${idToToken.length}) for vocabSize=${vocabSize}. Increase vocabSize or reduce charset.`,
      );
    }

    const tokenToId = new Map<string, number>();
    for (let i = 0; i < idToToken.length; i++) tokenToId.set(idToToken[i], i);

    // Linked-list representation of all pieces laid end-to-end
    let totalLen = 0;
    for (const p of pieces) totalLen += p.length;

    const tokens = new Uint16Array(totalLen);
    const next = new Int32Array(totalLen);
    const prev = new Int32Array(totalLen);
    const starts = new Int32Array(pieces.length);

    let w = 0;
    for (let pi = 0; pi < pieces.length; pi++) {
      const piece = pieces[pi];
      starts[pi] = w;

      const start = w;
      for (const ch of piece) {
        tokens[w] = (tokenToId.get(ch) ?? unkId) as number;
        prev[w] = w - 1;
        next[w] = w + 1;
        w++;
      }

      if (w > start) {
        prev[start] = -1;
        next[w - 1] = -1;
      }
    }

    // Pair stats: key -> {count, indices}
    const stats = new Map<number, {count: number; indices: number[]}>();

    // For vocabSize<=65535, (a<<16)|b is safe.
    const getPairKey = (a: number, b: number) => (a << 16) | b;

    function updateStatsAt(idx: number, delta: number) {
      const n = next[idx];
      if (n < 0) return; // -1 end, -2 removed
      const key = getPairKey(tokens[idx], tokens[n]);

      let entry = stats.get(key);
      if (!entry) {
        entry = {count: 0, indices: []};
        stats.set(key, entry);
      }

      entry.count += delta;

      // Append-only indices list (may contain stale indices later).
      // Merge application MUST validate adjacency at runtime.
      if (delta > 0) entry.indices.push(idx);

      if (entry.count <= 0 && delta < 0) stats.delete(key);
    }

    for (let i = 0; i < totalLen; i++) {
      if (next[i] >= 0) updateStatsAt(i, 1);
    }

    const merges: [number, number][] = [];

    while (idToToken.length < vocabSize) {
      // Find best pair by count
      let bestKey = -1;
      let bestCount = 0;
      for (const [key, entry] of stats) {
        if (entry.count > bestCount) {
          bestCount = entry.count;
          bestKey = key;
        }
      }
      if (bestCount < 2) break;

      const pairA = bestKey >>> 16;
      const pairB = bestKey & 0xffff;

      const newId = idToToken.length;
      idToToken.push(idToToken[pairA] + idToToken[pairB]);
      merges.push([pairA, pairB]);

      console.log(
        `${idToToken.length}. "${idToToken[pairA]}+${idToToken[pairB]}" occurred ${bestCount} times`,
      );

      const indices = stats.get(bestKey)!.indices;

      for (const idx of indices) {
        const n = next[idx];
        if (n < 0) continue;

        // ✅ critical correctness guard: idx -> n must be a *live* edge now
        if (prev[n] !== idx) continue;

        if (tokens[idx] !== pairA) continue;
        if (tokens[n] !== pairB) continue;

        // ✅ deterministic overlapping handling (only matters when pairA === pairB):
        // skip if idx is the SECOND element of another identical candidate pair.
        // This makes the result match a left-to-right greedy merge (like applyMerge).
        if (pairA === pairB) {
          const p0 = prev[idx];
          if (p0 >= 0 && next[p0] === idx && tokens[p0] === pairA) {
            continue;
          }
        }

        const p = prev[idx];
        const after = next[n];

        // Remove affected pair counts before rewiring
        if (p >= 0) updateStatsAt(p, -1); // (p, idx) changes
        if (after >= 0) updateStatsAt(n, -1); // (n, after) removed

        // Merge: replace idx token with newId and remove n
        tokens[idx] = newId as number;
        next[idx] = after;
        if (after >= 0) prev[after] = idx;

        // Mark removed node (debug-friendly); ensure code treats negative next/prev as removed/end.
        prev[n] = -2;
        next[n] = -2;

        // Add updated pair counts after rewiring
        if (p >= 0) updateStatsAt(p, 1);
        if (after >= 0) updateStatsAt(idx, 1);
      }

      stats.delete(bestKey);
    }

    // Fast extraction of final token stream (O(N))
    log('[bpe] extracting final token stream...');
    const out = new Uint16Array(totalLen);
    let outIdx = 0;

    for (let pi = 0; pi < starts.length; pi++) {
      let cur = starts[pi];
      while (cur >= 0) {
        out[outIdx++] = tokens[cur];
        cur = next[cur];
      }
    }

    const finalTokens = out.subarray(0, outIdx);
    log(`[bpe] final token count=${finalTokens.length}`);

    const tokenizer = new Tokenizer({
      vocabSize: idToToken.length,
      unkId,
      unkToken,
      idToToken,
      merges,
    });

    return {tokenizer, tokens: finalTokens};
  }

  // ---------- Shared preprocessing (Node + browser) ----------

  static preprocess(corpus: string): string[] {
    return (
      corpus
        .replace(/\r\n/g, '\n')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[—–]/g, '-')
        // strip accents/diacritics
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        // common non-combining latin chars (optional but useful)
        .replace(/ß/g, 'ss')
        .replace(/Æ/g, 'AE')
        .replace(/æ/g, 'ae')
        .replace(/Œ/g, 'OE')
        .replace(/œ/g, 'oe')
        .replace(/Ø/g, 'O')
        .replace(/ø/g, 'o')
        .replace(/Ł/g, 'L')
        .replace(/ł/g, 'l')
        .replace(/Đ/g, 'D')
        .replace(/đ/g, 'd')
        .replace(/Þ/g, 'Th')
        .replace(/þ/g, 'th')
        // keep \n, collapse other whitespace
        .replace(/\s*\[[^\]]+\]\s*/g, ' ') // remove "[stuff in square brackets]"
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        // english-ish only + punctuation + newline
        .replace(/[^A-Za-z0-9 \n.,;:?'"()!-]/g, ' ')
        .match(
          /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu,
        ) ?? []
    );
  }

  // ---------- Internal shared tokenization (deduped for encode/encodeToUint16) ----------

  private encodePreprocessedPiecesToWords(pieces: string[]): number[][] {
    const words: number[][] = pieces.map((p) =>
      [...p].map((ch) => this.charToId.get(ch) ?? this.unkId),
    );

    for (const [a, b, c] of this.mergeTriples) {
      applyMerge(words, a, b, c);
    }
    return words;
  }
}

function applyMerge(
  arr: number[][],
  val1: number,
  val2: number,
  newVal: number,
) {
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    const n = s.length;
    if (n < 2) continue;

    let j = 0;
    let w = 0;

    while (j < n) {
      if (j + 1 < n && s[j] === val1 && s[j + 1] === val2) {
        s[w++] = newVal;
        j += 2;
      } else {
        s[w++] = s[j++];
      }
    }

    if (w < n) s.length = w;
  }
}
