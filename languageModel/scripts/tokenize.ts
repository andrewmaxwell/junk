// scripts/tokenize.ts
import fs from 'fs';
import path from 'path';
import {Tokenizer} from '../src/Tokenizer';
import {modelConfig} from '../src/config';

const CORPUS_DIR = '/Users/andrew/Desktop/corpus';
const TRAIN_FILE = './public/train.bin';
const TOKENIZER_FILE = './public/tokenizer.json';

function loadCorpus(): string {
  const files = fs
    .readdirSync(CORPUS_DIR, {withFileTypes: true})
    .filter((entry) => entry.isFile() && entry.name.endsWith('.txt'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No .txt files found in ${CORPUS_DIR}`);
  }

  console.log(
    `Loading ${files.length} corpus file${files.length === 1 ? '' : 's'} from ${CORPUS_DIR}`,
  );

  return files
    .map((file) => fs.readFileSync(path.join(CORPUS_DIR, file), 'utf-8'))
    .join('\n\n');
}

function main() {
  const corpus = loadCorpus();

  const {tokenizer, tokens} = Tokenizer.trainFromText(
    corpus,
    modelConfig.vocabSize,
    {onProgress: (msg) => console.log(msg)},
  );

  // Write train.bin (uint16 token ids)
  fs.writeFileSync(
    TRAIN_FILE,
    Buffer.from(tokens.buffer, tokens.byteOffset, tokens.byteLength),
  );
  console.log(
    `Saved ${TRAIN_FILE} (${(tokens.byteLength / 1024 / 1024).toFixed(2)} MB)`,
  );

  // Write tokenizer.json
  fs.writeFileSync(TOKENIZER_FILE, JSON.stringify(tokenizer.toJSON()));
  console.log(`Saved ${TOKENIZER_FILE} (vocabSize=${tokenizer.vocabSize})`);
}

main();
