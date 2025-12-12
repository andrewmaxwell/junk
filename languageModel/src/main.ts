import {ModelRunner} from './Model';
import {generationConfig, modelConfig} from './config';
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

log('Starting training loop');

let promptReady = inputElement.value;
let step = 0;
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
  requestAnimationFrame(loop);
}

loop();

const goButton = document.getElementById('go') as HTMLButtonElement;
goButton.addEventListener('click', () => {
  goButton.disabled = true;
  promptReady = inputElement.value;
});
