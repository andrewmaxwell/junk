import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

export class Embedding {
  readonly vocabSize: number;
  readonly dim: number;
  readonly table: Float32Array;

  // Adam Cache
  readonly m: Float32Array;
  readonly v: Float32Array;

  // Accumulator: Map<TokenIndex, Float32Array(Gradient)>
  // We use a Map because only a tiny % of vocab is used per batch
  private gradAccumulator: Map<number, Float32Array>;

  constructor(
    vocabSize: number,
    dim: number,
    table?: Float32Array,
    m?: Float32Array,
    v?: Float32Array,
  ) {
    this.vocabSize = vocabSize;
    this.dim = dim;
    const size = vocabSize * dim;

    this.table = table ?? new Float32Array(size);
    this.m = m ?? new Float32Array(size);
    this.v = v ?? new Float32Array(size);

    if (!table) {
      const limit = 1 / Math.sqrt(dim);
      for (let i = 0; i < size; i++) {
        this.table[i] = (Math.random() * 2 - 1) * limit;
      }
    }

    this.gradAccumulator = new Map();
  }

  convertToEmbeddings(tokenIds: ArrayLike<number>, out: Float32Array) {
    const {dim, table} = this;
    const n = tokenIds.length;

    for (let c = 0; c < n; c++) {
      const id = tokenIds[c];
      const src = id * dim;
      const dst = c * dim;
      for (let j = 0; j < dim; j++) {
        out[dst + j] = table[src + j];
      }
    }
  }

  // 1. Accumulate Gradients (Don't update yet)
  accumulate(tokenIds: ArrayLike<number>, grad: Float32Array) {
    const {dim} = this;
    const n = tokenIds.length;

    for (let c = 0; c < n; c++) {
      const id = tokenIds[c];

      let tokenGrad = this.gradAccumulator.get(id);
      if (!tokenGrad) {
        tokenGrad = new Float32Array(dim);
        this.gradAccumulator.set(id, tokenGrad);
      }

      const gradOffset = c * dim;
      for (let j = 0; j < dim; j++) {
        tokenGrad[j] += grad[gradOffset + j];
      }
    }
  }

  // 2. Apply Updates (Adam)
  update(lr: number, batchSize: number, iter: number, clipNorm = 1.0) {
    const {dim, table, m, v} = this;
    const beta1 = 0.9,
      beta2 = 0.999,
      eps = 1e-8;
    const correction1 = 1 - Math.pow(beta1, iter);
    const correction2 = 1 - Math.pow(beta2, iter);
    const scale = 1.0 / batchSize;
    let globalNormSq = 0;

    // Compute gradient norm for clipping
    for (const [, gAcc] of this.gradAccumulator) {
      for (let j = 0; j < dim; j++) {
        const g = gAcc[j] * scale;
        globalNormSq += g * g;
      }
    }

    const totalNorm = Math.sqrt(globalNormSq) + 1e-9;
    const clipCoef = clipNorm > 0 ? Math.min(1, clipNorm / totalNorm) : 1;

    // Only iterate over tokens that appeared in this batch
    for (const [id, gAcc] of this.gradAccumulator) {
      const rowStart = id * dim;

      for (let j = 0; j < dim; j++) {
        const idx = rowStart + j;
        const g = gAcc[j] * scale * clipCoef; // Average

        // Adam Update
        m[idx] = beta1 * m[idx] + (1 - beta1) * g;
        v[idx] = beta2 * v[idx] + (1 - beta2) * g * g;

        const mHat = m[idx] / correction1;
        const vHat = v[idx] / correction2;

        table[idx] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
      }
    }

    // Flush the bucket
    this.gradAccumulator.clear();
  }
  saveToDisk() {
    const {vocabSize, dim, table, m, v} = this;
    const dir = resolve('.', 'languageModel');
    mkdirSync(dir, {recursive: true});

    const header = new Uint32Array([vocabSize, dim]);
    const headerBytes = new Uint8Array(
      header.buffer,
      header.byteOffset,
      header.byteLength,
    );

    const tableBytes = new Uint8Array(
      table.buffer,
      table.byteOffset,
      table.byteLength,
    );
    const mBytes = new Uint8Array(m.buffer, m.byteOffset, m.byteLength);
    const vBytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

    const totalBytes =
      headerBytes.length + tableBytes.length + mBytes.length + vBytes.length;
    const out = new Uint8Array(totalBytes);

    let offset = 0;
    out.set(headerBytes, offset);
    offset += headerBytes.length;

    out.set(tableBytes, offset);
    offset += tableBytes.length;

    out.set(mBytes, offset);
    offset += mBytes.length;

    out.set(vBytes, offset);

    const fileName = `embeddings_${vocabSize}x${dim}.bin`;
    const filePath = resolve(dir, fileName);
    writeFileSync(filePath, out);
    return filePath;
  }
  static loadFromDisk(vocabSize: number, dim: number) {
    const size = vocabSize * dim;
    const fileName = `embeddings_${vocabSize}x${dim}.bin`;
    const filePath = resolve('.', 'languageModel', fileName);

    if (existsSync(filePath)) {
      console.log(`loading ${filePath}`);
      const bytes = readFileSync(filePath);
      const buffer = bytes.buffer;
      const baseOffset = bytes.byteOffset;
      const header = new Uint32Array(buffer, baseOffset, 2);

      if (header[0] === vocabSize && header[1] === dim) {
        let offset = baseOffset + header.byteLength;
        const table = new Float32Array(buffer, offset, size);
        offset += table.byteLength;
        const m = new Float32Array(buffer, offset, size);
        offset += m.byteLength;
        const v = new Float32Array(buffer, offset, size);
        return new Embedding(vocabSize, dim, table, m, v);
      }
    }

    return new Embedding(vocabSize, dim);
  }
}
