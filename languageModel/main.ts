import {LanguageModel} from './LanguageModel';
import {Tokenizer} from './Tokenizer';

const fast = false;
const train = true;

// model params
const vocabSize = 2048;
const embDim = fast ? 32 : 128;
const contextSize = fast ? 32 : 128;
const hiddenLayers = fast ? [128, 128] : [256, 256, 256];

// training params
const trainingSteps = fast ? 1000 : 50_000;
const batchSize = 32;
const baseLr = 1e-3;
const finalLr = 1e-4;
const clipNorm = 1.0;

// generation params
const prompt = 'Jesus said';
const generateLength = 200; // tokens
const temperature = 1;
const topP = 0.9;

const tokenizer = Tokenizer.loadFromDisk('./jibberjabber/bible.txt', vocabSize);

const model = new LanguageModel(
  tokenizer,
  vocabSize,
  embDim,
  contextSize,
  hiddenLayers,
);

if (train) {
  const start = Date.now();
  model.train(trainingSteps, batchSize, baseLr, finalLr, clipNorm);
  console.log(`Finished in ${formatMs(Date.now() - start)}`);
}

const generated = model.generate(prompt, generateLength, temperature, topP);
console.log(`Prompt: "${prompt}"\nGenerated: "${generated}"`);

function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
