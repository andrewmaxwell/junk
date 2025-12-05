// Incremental BPE with heap + occurrence lists (plain lowercase ASCII)
const SHIFT = 16,
  MASK = (1 << SHIFT) - 1;
const pack = (a: number, b: number) => (a << SHIFT) | b;

class Heap {
  keys: number[] = [];
  values: number[] = [];
  push(key: number, count: number) {
    let i = this.keys.length;
    this.keys.push(key);
    this.values.push(count);
    while (i) {
      const p = (i - 1) >>> 1;
      if (this.values[p] >= count) break;
      this.keys[i] = this.keys[p];
      this.values[i] = this.values[p];
      i = p;
    }
    this.keys[i] = key;
    this.values[i] = count;
  }
  pop(): [number, number] | null {
    const n = this.keys.length;
    if (!n) return null;
    const key = this.keys[0],
      cnt = this.values[0];
    const kn = this.keys.pop()!,
      cn = this.values.pop()!;
    if (n > 1) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1,
          r = l + 1;
        if (l >= n - 1) break;
        const m = r < n - 1 && this.values[r] > this.values[l] ? r : l;
        if (cn >= this.values[m]) break;
        this.keys[i] = this.keys[m];
        this.values[i] = this.values[m];
        i = m;
      }
      this.keys[i] = kn;
      this.values[i] = cn;
    }
    return [key, cnt];
  }
  get size() {
    return this.keys.length;
  }
}

export function tokenize(text: string, vocab: number, log = false) {
  const n = text.length;
  const ids = new Uint32Array(n);
  const alive = new Uint8Array(n);
  alive.fill(1);
  const prev = new Int32Array(n),
    next = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    prev[i] = i - 1;
    next[i] = i + 1;
  }
  next[n - 1] = -1;

  // ASCII char -> id
  const map = new Int32Array(128);
  map.fill(-1);
  const idToToken: string[] = [''];
  for (let i = 0; i < n; i++) {
    const code = text.charCodeAt(i) & 127;
    let id = map[code];
    if (id < 0) {
      id = idToToken.length;
      idToToken.push(String.fromCharCode(code));
      map[code] = id;
    }
    ids[i] = id;
  }

  // Occurrence lists
  const occKey = new Int32Array(n);
  occKey.fill(-1);
  const occPrev = new Int32Array(n);
  occPrev.fill(-1);
  const occNext = new Int32Array(n);
  occNext.fill(-1);
  const head = new Map<number, number>();
  const counts = new Map<number, number>();
  const heap = new Heap();

  const inc = (key: number) => {
    const c = (counts.get(key) || 0) + 1;
    counts.set(key, c);
    heap.push(key, c);
  };
  const dec = (key: number) => {
    const c = (counts.get(key) || 0) - 1;
    if (c > 0) {
      counts.set(key, c);
      heap.push(key, c);
    } else {
      counts.delete(key);
      head.delete(key);
    }
  };

  const addOcc = (key: number, i: number) => {
    const j = next[i];
    if (i < 0 || j < 0 || !alive[i] || !alive[j]) return;
    occKey[i] = key;
    const h = head.get(key) ?? -1;
    occPrev[i] = -1;
    occNext[i] = h;
    if (h >= 0) occPrev[h] = i;
    head.set(key, i);
    inc(key);
  };

  const removeOcc = (i: number) => {
    const key = occKey[i];
    if (key < 0) return;
    const p = occPrev[i],
      q = occNext[i];
    if (p >= 0) occNext[p] = q;
    else head.set(key, q >= 0 ? q : -1);
    if (q >= 0) occPrev[q] = p;
    occKey[i] = occPrev[i] = occNext[i] = -1;
    dec(key);
  };

  const valid = (i: number, a: number, b: number) => {
    const j = next[i];
    return (
      j >= 0 &&
      alive[i] &&
      alive[j] &&
      ids[i] === a &&
      ids[j] === b &&
      prev[j] === i
    );
  };

  // Seed occurrences for all adjacent pairs
  for (let i = 0; i + 1 < n; i++) addOcc(pack(ids[i], ids[i + 1]), i);

  // Training loop
  while (idToToken.length - 1 < vocab && heap.size) {
    // pop current best (lazy-stale skip), require at least 2
    let key = -1,
      cnt = 0,
      top: [number, number] | null;
    while ((top = heap.pop())) {
      const [k, c] = top,
        cur = counts.get(k) || 0;
      if (c === cur && cur >= 2) {
        key = k;
        cnt = c;
        break;
      }
    }
    if (key < 0) break;

    const a = (key >>> SHIFT) & MASK,
      b = key & MASK;
    const newId = idToToken.length;
    if (newId >= 1 << SHIFT)
      throw new Error('token id overflow (increase SHIFT)');
    idToToken.push(idToToken[a] + idToToken[b]);
    if (log)
      console.log(
        `${newId}: "${idToToken[a]}|${idToToken[b]}" (${cnt.toLocaleString()})`,
      );

    // SNAPSHOT all current occurrence indices of (a,b) BEFORE mutating the list
    const occ: number[] = [];
    for (let i = head.get(key) ?? -1; i >= 0; i = occNext[i]) occ.push(i);

    // Merge non-overlapping occurrences
    for (let idx = 0; idx < occ.length; idx++) {
      const i = occ[idx];
      if (occKey[i] !== key || !valid(i, a, b)) {
        removeOcc(i);
        continue;
      }
      const j = next[i],
        p = prev[i],
        r = next[j];

      // remove occurrences that disappear: (p,a) at p, (b,r) at j, and this (a,b) at i
      if (p >= 0 && next[p] === i) {
        const k1 = pack(ids[p], ids[i]);
        if (occKey[p] === k1) removeOcc(p);
      }
      if (j >= 0 && r >= 0 && next[j] === r) {
        const k2 = pack(ids[j], ids[r]);
        if (occKey[j] === k2) removeOcc(j);
      }
      removeOcc(i);

      // splice j out, set i := newId
      if (r >= 0) prev[r] = i;
      next[i] = r;
      prev[j] = next[j] = -1;
      alive[j] = 0;
      ids[i] = newId;

      // add new neighboring occurrences: (p,newId) at p and (newId,r) at i
      if (p >= 0 && next[p] === i) addOcc(pack(ids[p], ids[i]), p);
      if (r >= 0 && prev[r] === i) addOcc(pack(ids[i], ids[r]), i);
    }

    head.delete(key);
    counts.delete(key);
  }

  // Rebuild final token stream from linked list
  let s = -1;
  for (let i = 0; i < n; i++)
    if (alive[i] && prev[i] < 0) {
      s = i;
      break;
    }
  const out: number[] = [];
  for (let i = s; i >= 0; i = next[i]) out.push(ids[i]);
  return {idToToken, result: out};
}

// import fs from 'fs';
// const books = [
//   'bible',
//   'moby-dick',
//   'tale-of-two-cities',
//   'pride-and-prejudice',
//   'huckleberry-finn',
//   'reddit-secrets',
//   'alice-in-wonderland',
// ];
// const corpus = books
//   .map(
//     (b) =>
//       ' ' +
//       fs
//         .readFileSync(`./jibberjabber/${b}.txt`, 'utf-8')
//         .toLowerCase()
//         .replace(/\s+/g, ' '),
//   )
//   .join('');

// const {idToToken, result} = tokenize(corpus, 1000, true);
// const sampleSize = 1000;
// const randIndex = Math.floor(Math.random() * (result.length - sampleSize));
// console.log(
//   result
//     .slice(randIndex, randIndex + sampleSize)
//     .map((t) => idToToken[t])
//     .join('|'),
// );
// console.log(idToToken.join('|'));
// console.log(`corpus size: ${corpus.length.toLocaleString()} chars`);
// console.log(`result length: ${result.length.toLocaleString()} tokens`);
