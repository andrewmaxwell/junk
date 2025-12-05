// bigram_lm.ts
// Tiny character-level bigram language model in TypeScript, from scratch.
// - Trains on all .txt files in ~/junk/jibberjabber
// - Uses <start> and <end> special tokens
// - No CLI: just import and call the exported functions.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------- Types ----------

type Vocab = {
  stoi: Map<string, number>;
  itos: string[];
};

type BigramModel = {
  vocab: Vocab;
  probs: number[][]; // probs[prevId][nextId] = P(next | prev)
};

// ---------- 0. Load corpus from directory ----------

/**
 * Loads all .txt files from ~/junk/jibberjabber (by default) and
 * returns an array of their contents, one string per file/book.
 */
function loadTextsFromDir(
  dir: string = path.join(os.homedir(), 'junk', 'jibberjabber'),
): string[] {
  const entries = fs.readdirSync(dir, {withFileTypes: true});

  const texts: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.txt')) continue;

    const fullPath = path.join(dir, entry.name);
    console.log('reading', fullPath);
    const content = fs.readFileSync(fullPath, 'utf8');
    texts.push(content);
  }

  if (texts.length === 0) {
    throw new Error(`No .txt files found in directory: ${dir}`);
  }

  return texts;
}

// ---------- 1. Build vocabulary from multiple texts ----------

/**
 * Build a character-level vocabulary across multiple texts.
 * Adds special tokens "<start>" and "<end>".
 */
function buildVocabFromTexts(texts: string[]): Vocab {
  const chars = new Set<string>();

  for (const text of texts) {
    for (const ch of text) {
      chars.add(ch);
    }
  }

  // Add special start/end tokens (lowercase, as requested)
  chars.add('<start>');
  chars.add('<end>');

  const itos = Array.from(chars);
  const stoi = new Map<string, number>();
  itos.forEach((ch, idx) => stoi.set(ch, idx));

  return {stoi, itos};
}

// ---------- 2. Train bigram model on multiple texts ----------

/**
 * Train a bigram model on multiple sequences (one per text/book).
 * Each text is framed as: <start> [chars...] <end>.
 */
function trainBigramModelOnTexts(
  texts: string[],
  vocab: Vocab,
  alpha: number = 0.1, // Laplace smoothing
): BigramModel {
  const V = vocab.itos.length;
  const counts: number[][] = Array.from(
    {length: V},
    () => Array<number>(V).fill(alpha), // start with alpha for smoothing
  );

  const startId = vocab.stoi.get('<start>')!;
  const endId = vocab.stoi.get('<end>')!;

  for (const text of texts) {
    let prev = startId;

    for (const ch of text) {
      const next = vocab.stoi.get(ch);
      if (next === undefined) {
        // Shouldn't happen if vocab built from same texts, but guard anyway.
        continue;
      }
      counts[prev][next] += 1;
      prev = next;
    }

    // End-of-sequence transition
    counts[prev][endId] += 1;
  }

  // Convert counts -> probabilities
  const probs = counts.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return row.map((c) => c / sum);
  });

  return {vocab, probs};
}

// ---------- 3. Sampling helpers ----------

function sampleFromDistribution(dist: number[]): number {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < dist.length; i++) {
    acc += dist[i];
    if (r < acc) return i;
  }
  return dist.length - 1; // fallback
}

/**
 * Generate a single text sample from the model.
 */
function generateText(model: BigramModel, maxLen: number = 200): string {
  const {vocab, probs} = model;
  const startId = vocab.stoi.get('<start>')!;
  const endId = vocab.stoi.get('<end>')!;

  let prev = startId;
  let out = '';

  for (let i = 0; i < maxLen; i++) {
    const row = probs[prev];
    const next = sampleFromDistribution(row);
    if (next === endId) break;

    const ch = vocab.itos[next];

    // Don’t print special tokens
    if (ch !== '<start>' && ch !== '<end>') {
      out += ch;
    }

    prev = next;
  }

  return out;
}

// ---------- 4. Scoring text (log-probability) ----------

/**
 * Compute log-probability of a given string under the model.
 * (Optional but handy for experimentation.)
 */
function logProbOfString(model: BigramModel, text: string): number {
  const {vocab, probs} = model;
  const startId = vocab.stoi.get('<start>')!;
  const endId = vocab.stoi.get('<end>')!;

  let prev = startId;
  let logp = 0;

  for (const ch of text) {
    const next = vocab.stoi.get(ch);
    if (next === undefined) continue;
    const p = probs[prev][next];
    logp += Math.log(p);
    prev = next;
  }

  const pEnd = probs[prev][endId];
  logp += Math.log(pEnd);

  return logp;
}

// ---------- 5. Convenience helper: train directly from ~/junk/jibberjabber ----------

/**
 * One-call convenience:
 * - Reads all .txt files from ~/junk/jibberjabber
 * - Builds vocab
 * - Trains bigram model
 */
function trainModelFromDefaultDir(alpha: number = 0.5): BigramModel {
  const texts = loadTextsFromDir();
  const vocab = buildVocabFromTexts(texts);
  const model = trainBigramModelOnTexts(texts, vocab, alpha);
  return model;
}

///////

const model = trainModelFromDefaultDir(0.5);

const sample = generateText(model, 4000);
console.log('Sample:\n', sample);

const lp = logProbOfString(model, 'hello world');
console.log("log P('hello world') =", lp);
