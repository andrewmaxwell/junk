import {generationConfig, modelConfig} from './config';
import {ModelRunner} from './ModelRunner';
import {Tokenizer} from './Tokenizer';

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

const tokenizer = await Tokenizer.loadFromUrl('tokenizer.json');

log('Uploading data to GPU and initializing model');
await modelRunner.uploadCorpus('train.bin');
modelRunner.createModel(modelConfig);

const checkpointKey = 'browser-llm-gpt-checkpoint';
let step = 0;
try {
  const checkpoint = await modelRunner.loadCheckpoint(checkpointKey);
  if (checkpoint) {
    step = checkpoint.step;
    log(`Checkpoint restored: step=${step} savedAt=${checkpoint.savedAt}`);
  } else {
    log('No checkpoint found; starting fresh');
  }
} catch (e) {
  log(`Checkpoint load failed: ${e instanceof Error ? e.message : String(e)}`);
}

log('Starting training loop');

let promptReady = inputElement.value;
const checkpointIntervalMs = 30_000;
let nextCheckpointAt = performance.now() + checkpointIntervalMs;
async function loop() {
  const lossVal = await modelRunner.trainStep(
    modelConfig.batchSize,
    modelConfig.maxLen,
  );
  if (step % 10 === 0) {
    const ppl = Math.exp(lossVal).toFixed(2);
    log(`step=${step} loss=${lossVal.toFixed(2)} ppl=${ppl}`);
    if (promptReady) {
      const startIds = tokenizer.encode(promptReady);
      const genIds = await modelRunner.generate(startIds, generationConfig);
      outputElement.innerHTML = '';
      tokenizer.decode(genIds).forEach((str) => {
        const token = document.createElement('span');
        token.innerText = str;
        outputElement.append(token);
      });
      goButton.disabled = false;
      promptReady = '';
    }
  }
  step++;
  if (performance.now() >= nextCheckpointAt) {
    nextCheckpointAt = performance.now() + checkpointIntervalMs;
    try {
      await modelRunner.saveCheckpoint(checkpointKey, {step});
      log(`Checkpoint saved: step=${step}`);
    } catch (e) {
      log(
        `Checkpoint save failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  requestAnimationFrame(loop);
}

loop();

const goButton = document.getElementById('go') as HTMLButtonElement;
goButton.addEventListener('click', () => {
  goButton.disabled = true;
  promptReady = inputElement.value;
});
