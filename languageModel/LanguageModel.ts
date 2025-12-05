import {Embedding} from './Embeddings';
import {NeuralNetwork} from './NeuralNetwork';
import type {Tokenizer} from './Tokenizer';

export class LanguageModel {
  readonly tokenizer: Tokenizer;
  readonly contextSize: number;
  readonly emb: Embedding;
  readonly net: NeuralNetwork;
  constructor(
    tokenizer: Tokenizer,
    vocabSize: number,
    embDim = 32,
    contextSize = 32,
    hiddenLayers = [256, 256],
  ) {
    this.tokenizer = tokenizer;
    this.contextSize = contextSize;
    this.emb = Embedding.loadFromDisk(vocabSize, embDim);

    const layerSizes = [contextSize * embDim, ...hiddenLayers, vocabSize];
    this.net = NeuralNetwork.loadFromDisk(layerSizes);
    console.log('Neural network created with layer sizes:', ...layerSizes);
  }
  train(
    totalSteps = 20000,
    batchSize = 32,
    baseLr = 1e-3,
    finalLr = 1e-4,
    clipNorm = 1.0,
  ) {
    const {tokenizer, contextSize, net, emb} = this;
    const embInput = new Float32Array(contextSize * emb.dim);
    const contextIds = new Int32Array(contextSize);

    let runningLoss = 0;

    // MAIN LOOP
    for (let step = 1; step <= totalSteps; step++) {
      net.zeroGrads();

      // 2. Accumulate Gradients (The Batch Loop)
      for (let b = 0; b < batchSize; b++) {
        // writes to contextIds, returns target
        const target = tokenizer.getTrainingTarget(contextIds);

        emb.convertToEmbeddings(contextIds, embInput);

        // Computes gradients and adds to "buckets"
        const probs = net.backward(embInput, target);

        // Also accumulate embedding gradients (using net[0].deltas)
        emb.accumulate(contextIds, net.layers[0].deltas);

        runningLoss += -Math.log(probs[target] + 1e-12);
      }

      // 3. Update Weights (once per batch)
      const t = step / totalSteps;
      const lr = baseLr * (1 - t) + finalLr * t; // linear decay
      net.updateWeights(lr, batchSize, step, clipNorm);
      emb.update(lr, batchSize, step, clipNorm);

      if (step % 100 === 0) {
        // Loss is summed over batch, so divide by batchSize too
        const avgLoss = runningLoss / (100 * batchSize);
        const ppl = Math.exp(avgLoss);
        runningLoss = 0;
        console.log(
          `Loss=${avgLoss.toFixed(2)} • PPL=${ppl.toFixed(2)} • ${Math.round((1000 * step) / totalSteps) / 10}%`,
        );
        emb.saveToDisk();
        net.saveToDisk();
      }
    }
  }
  generate(prompt: string, maxLen = 200, temperature = 0.5, topP = 0.9) {
    const {tokenizer, contextSize, emb, net} = this;
    // 1. Prepare fixed-size context buffer
    const contextIds = new Int32Array(contextSize);

    // 2. Prepare embedding buffer (reused every step)
    const embInput = new Float32Array(contextSize * emb.dim);

    // 3. Seed context with prompt (left-padded, truncate if too long)
    const promptIds = tokenizer.encode(prompt);
    const copyLen = Math.min(promptIds.length, contextSize);
    const offset = contextSize - copyLen;
    for (let i = 0; i < copyLen; i++) {
      contextIds[offset + i] = promptIds[promptIds.length - copyLen + i];
    }

    const generated: number[] = [];

    // 4. Generation Loop
    for (let i = 0; i < maxLen; i++) {
      // A. Embed
      emb.convertToEmbeddings(contextIds, embInput);

      // B. Forward Pass -> logits
      const logits = net.forward(embInput);

      // C. Sample (top-p)
      const nextId = sampleFromLogitsTopP(logits, temperature, topP);
      generated.push(nextId);

      // D. Shift context window
      contextIds.copyWithin(0, 1);
      contextIds[contextSize - 1] = nextId;
    }

    return tokenizer.decode(generated);
  }
}

// Sample from logits with temperature and top-p (nucleus)
const sampleFromLogitsTopP = (
  logits: Float32Array,
  temperature: number,
  topP: number,
): number => {
  const n = logits.length;
  if (temperature === 0) {
    // greedy argmax
    let maxI = 0;
    for (let i = 1; i < n; i++) if (logits[i] > logits[maxI]) maxI = i;
    return maxI;
  }

  // sort indices by logit desc
  const idx = new Array<number>(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => logits[b] - logits[a]);

  // compute softmax probs over sorted logits with temperature
  let sum = 0;
  const probs = new Float32Array(n);
  const invT = 1 / temperature;
  const maxLogit = logits[idx[0]] * invT;
  for (let i = 0; i < n; i++) {
    const p = Math.exp(logits[idx[i]] * invT - maxLogit);
    probs[i] = p;
    sum += p;
  }
  // normalize
  for (let i = 0; i < n; i++) probs[i] /= sum;

  // find smallest prefix whose cumulative prob >= topP
  let cum = 0;
  let cutoff = n;
  for (let i = 0; i < n; i++) {
    cum += probs[i];
    if (cum >= topP) {
      cutoff = i + 1;
      break;
    }
  }

  // sample within that prefix
  let r = Math.random() * cum;
  for (let i = 0; i < cutoff; i++) {
    r -= probs[i];
    if (r <= 0) return idx[i];
  }
  return idx[cutoff - 1];
};
