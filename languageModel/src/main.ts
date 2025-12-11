import {Tokenizer} from './Tokenizer';
import {ModelRunner, type GPTConfig, type GenerationConfig} from './Model';

// --- Config & State ---
const batchSize = 64;

const modelConfig: GPTConfig = {
  vocabSize: 2048,
  dModel: 128, // Embedding dim
  nHeads: 8, // Attention heads
  nLayers: 8, // Transformer blocks
  maxLen: 128, // Context window
  dropout: 0.1,
  learningRate: 3e-4,
  maxGradNorm: 1.0,
};

const generationConfig: GenerationConfig = {
  generateLength: 100, // tokens
  temperature: 0.9,
  penaltyLookback: 32,
  repetitionPenalty: 1.2,
  topK: 40,
  topP: 0.9,
};

const prompt = 'Thus saith the LORD';

const output = document.getElementById('output') as HTMLTextAreaElement;
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
    output.scrollTop + output.clientHeight >= output.scrollHeight - 1;
  output.value += `[${elapsed}] ${str}\n`;
  if (wasAtBottom) output.scrollTop = output.scrollHeight;
}

const modelRunner = new ModelRunner();
log(`Backend loaded: ${await modelRunner.initBackend()}`);

const tokenizer = new Tokenizer(modelConfig.vocabSize);
await tokenizer.load('corpus.txt', log);

log('Uploading data to GPU and initializing model');
modelRunner.uploadCorpus(tokenizer.corpusTokens);
modelRunner.createModel(modelConfig);

log('Starting training loop');

let step = 0;

async function loop() {
  const lossVal = await modelRunner.trainStep(batchSize, modelConfig.maxLen);
  if (step % 10 === 0) {
    log(`Step ${step} | Loss: ${lossVal.toFixed(4)}`);
  }
  step++;

  if (step % 100 === 0) {
    const startIds = tokenizer.encode(prompt);
    const genIds = await modelRunner.generate(startIds, generationConfig);
    log(`[Step ${step}]\n` + tokenizer.decode(genIds));
  }

  requestAnimationFrame(loop);
}

loop();
