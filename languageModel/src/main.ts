import {Tokenizer} from './Tokenizer';
import {ModelRunner, type GPTConfig, type GenerationConfig} from './Model';

// --- Config & State ---
const batchSize = 32;

const modelConfig: GPTConfig = {
  vocabSize: 4096, // MUST MATCH IN scripts/tokenize.ts
  dModel: 128, // Embedding dim
  nHeads: 8, // Attention heads
  nLayers: 8, // Transformer blocks
  maxLen: 256, // Context window
  dropout: 0.02,
  learningRate: 3e-4,
  maxGradNorm: 1.0,
};

const generationConfig: GenerationConfig = {
  generateLength: 100, // tokens
  temperature: 0.8,
  penaltyLookback: 32,
  repetitionPenalty: 1.05,
  topK: 40,
  topP: 0.95,
};

const inputElement = document.getElementById('input') as HTMLInputElement;
const outputElement = document.getElementById('output') as HTMLPreElement;
const logEl = document.getElementById('log') as HTMLTextAreaElement;

function log(str: string) {
  const seconds = Math.floor(performance.now() / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const elapsed = [
    hours ? `${hours}h` : '',
    minutes ? (minutes % 60) + 'm' : '',
    (seconds % 60) + 's',
  ].join('');
  const wasAtBottom =
    logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 1;
  logEl.value += `${elapsed}: ${str}\n`;
  if (wasAtBottom) logEl.scrollTop = logEl.scrollHeight;
}

const modelRunner = new ModelRunner();
log(`Backend loaded: ${await modelRunner.initBackend()}`);

const tokenizer = new Tokenizer();
await tokenizer.load('tokenizer.json');

log('Uploading data to GPU and initializing model');
await modelRunner.uploadCorpus('train.bin');
modelRunner.createModel(modelConfig);

log('Starting training loop');

let promptReady = '';
let step = 0;
async function loop() {
  const lossVal = await modelRunner.trainStep(batchSize, modelConfig.maxLen);
  if (step % 10 === 0) {
    const ppl = Math.exp(lossVal).toFixed(2);
    log(`step=${step} loss=${lossVal.toFixed(2)} ppl=${ppl}`);
    if (promptReady) {
      const startIds = tokenizer.encode(promptReady);
      const genIds = await modelRunner.generate(startIds, generationConfig);
      outputElement.innerText = tokenizer.decode(genIds);
      goButton.disabled = false;
      promptReady = '';
    }
  }
  step++;
  requestAnimationFrame(loop);
}

loop();

const goButton = document.getElementById('go') as HTMLButtonElement;
goButton.addEventListener('click', () => {
  goButton.disabled = true;
  promptReady = inputElement.value;
});
