import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';

export interface GPTConfig {
  vocabSize: number;
  dModel: number;
  nHeads: number;
  nLayers: number;
  maxLen: number;
  dropout: number;
  learningRate: number;
  maxGradNorm: number;
}

export interface GenerationConfig {
  generateLength: number;
  temperature: number;
  penaltyLookback: number;
  repetitionPenalty: number;
  topK: number;
  topP: number;
}

// KV Cache Type: Array of [Key, Value] tensors per layer
type KVCache = {k: tf.Tensor; v: tf.Tensor}[];

type NormParams = {g: tf.Variable; b: tf.Variable};
type AttentionWeights = {
  Wq: tf.Variable;
  Wk: tf.Variable;
  Wv: tf.Variable;
  Wo: tf.Variable;
};
type MlpWeights = {
  W1: tf.Variable;
  b1: tf.Variable;
  W2: tf.Variable;
  b2: tf.Variable;
};
type TransformerBlock = {
  ln1: NormParams;
  ln2: NormParams;
  attn: AttentionWeights;
  mlp: MlpWeights;
};

export class GPT {
  private config: GPTConfig;
  private tokenEmbedding!: tf.Variable;
  private positionEmbedding!: tf.Variable;
  public blocks: TransformerBlock[];
  private ln_f!: NormParams;
  private head!: tf.Variable;
  private optimizer: tf.Optimizer;
  private maskCache: Map<number, tf.Tensor2D>;
  private trainableVars: tf.Variable[];

  constructor(config: GPTConfig) {
    this.config = config;
    if (config.dModel % config.nHeads !== 0) {
      throw new Error('dModel must be divisible by nHeads');
    }
    this.blocks = [];
    this.maskCache = new Map();
    this.trainableVars = [];
    this.initWeights();
    // AdamW is usually preferred, but Adam with weight decay is fine.
    // Using a slightly lower LR for stability.
    this.optimizer = tf.train.adam(this.config.learningRate);
  }

  // --- Initialization (Improved) ---
  private initWeights() {
    const {vocabSize, dModel, nLayers, maxLen} = this.config;

    // GPT-2 style scaling for residual projections
    const std = 0.02;
    const projStd = 0.02 / Math.sqrt(2 * nLayers);

    this.tokenEmbedding = tf.variable(
      tf.randomNormal([vocabSize, dModel], 0, std),
      true,
      'tok_emb',
    );
    this.positionEmbedding = tf.variable(
      tf.randomNormal([maxLen, dModel], 0, std),
      true,
      'pos_emb',
    );

    for (let i = 0; i < nLayers; i++) {
      this.blocks.push({
        ln1: {
          g: tf.variable(tf.ones([dModel]), true, `l${i}_ln1_g`),
          b: tf.variable(tf.zeros([dModel]), true, `l${i}_ln1_b`),
        },
        ln2: {
          g: tf.variable(tf.ones([dModel]), true, `l${i}_ln2_g`),
          b: tf.variable(tf.zeros([dModel]), true, `l${i}_ln2_b`),
        },
        attn: {
          Wq: tf.variable(
            tf.randomNormal([dModel, dModel], 0, std),
            true,
            `l${i}_att_q`,
          ),
          Wk: tf.variable(
            tf.randomNormal([dModel, dModel], 0, std),
            true,
            `l${i}_att_k`,
          ),
          Wv: tf.variable(
            tf.randomNormal([dModel, dModel], 0, std),
            true,
            `l${i}_att_v`,
          ),
          Wo: tf.variable(
            tf.randomNormal([dModel, dModel], 0, projStd),
            true,
            `l${i}_att_o`,
          ),
        },
        mlp: {
          // 4x expansion standard for GPT
          W1: tf.variable(
            tf.randomNormal([dModel, 4 * dModel], 0, std),
            true,
            `l${i}_mlp_w1`,
          ),
          b1: tf.variable(tf.zeros([4 * dModel]), true, `l${i}_mlp_b1`),
          W2: tf.variable(
            tf.randomNormal([4 * dModel, dModel], 0, projStd),
            true,
            `l${i}_mlp_w2`,
          ),
          b2: tf.variable(tf.zeros([dModel]), true, `l${i}_mlp_b2`),
        },
      });
    }

    this.ln_f = {
      g: tf.variable(tf.ones([dModel]), true, 'ln_f_g'),
      b: tf.variable(tf.zeros([dModel]), true, 'ln_f_b'),
    };
    this.head = tf.variable(
      tf.randomNormal([dModel, vocabSize], 0, std),
      true,
      'head',
    );

    // Collect all trainable variables automatically
    this.refreshTrainables();
  }

  private refreshTrainables() {
    this.trainableVars = [
      this.tokenEmbedding,
      this.positionEmbedding,
      this.head,
      this.ln_f.g,
      this.ln_f.b,
    ];
    for (const block of this.blocks) {
      this.trainableVars.push(
        block.ln1.g,
        block.ln1.b,
        block.ln2.g,
        block.ln2.b,
        block.attn.Wq,
        block.attn.Wk,
        block.attn.Wv,
        block.attn.Wo,
        block.mlp.W1,
        block.mlp.b1,
        block.mlp.W2,
        block.mlp.b2,
      );
    }
  }

  // --- Forward Pass (Supports KV Caching) ---
  forward(
    indices: tf.Tensor2D,
    training = false,
    cache?: KVCache,
  ): {logits: tf.Tensor3D; newCache?: KVCache} {
    return tf.tidy(() => {
      const batchSize = indices.shape[0];
      const seqLen = indices.shape[1];

      // 1. Embeddings
      const tokEmb = tf.gather(this.tokenEmbedding, indices);

      // Handle positional embeddings logic for Inference (cache exists) vs Training
      let posEmb: tf.Tensor;
      if (cache) {
        // If we are generating, 'indices' is just the NEW token (seqLen 1).
        // The position index is the length of the cache.
        const startPos =
          cache && cache.length > 0 ? (cache[0].k.shape[1] ?? 0) : 0;
        posEmb = this.positionEmbedding
          .slice([startPos, 0], [seqLen, -1])
          .expandDims(0); // [1, 1, dModel]
      } else {
        posEmb = this.positionEmbedding.slice([0, 0], [seqLen, -1]);
      }

      let x = tokEmb.add(posEmb);
      x = this.maybeDropout(x, training);

      const newCache: KVCache = [];

      // 2. Transformer Blocks
      for (let i = 0; i < this.blocks.length; i++) {
        const block = this.blocks[i];

        // --- Attention Sub-Block ---
        const ln1 = this.layerNorm(x, block.ln1);

        // Pass existing cache for this layer if available
        const layerCache = cache ? cache[i] : undefined;
        const {
          out: attn,
          k,
          v,
        } = this.selfAttention(ln1, block, seqLen, layerCache);

        if (cache) newCache.push({k, v}); // Store new K/V for next step

        const attnOut = this.maybeDropout(attn, training);
        x = x.add(attnOut);

        // --- MLP Sub-Block ---
        const ln2 = this.layerNorm(x, block.ln2);
        let ff = this.feedForward(ln2, block);
        ff = this.maybeDropout(ff, training);
        x = x.add(ff);
      }

      // 3. Final Head
      x = this.layerNorm(x, this.ln_f);

      // If training or prefill, we compute logits for all tokens.
      // If inference (cached), usually we only care about the last token,
      // but 'x' here is already just the new tokens if we passed a slice.
      const x2d = x.reshape([-1, this.config.dModel]);
      const logits2d = tf.matMul(x2d, this.head);
      const logits = logits2d.reshape([
        batchSize,
        seqLen,
        this.config.vocabSize,
      ]) as tf.Tensor3D;

      return {logits, newCache: cache ? newCache : undefined};
    });
  }

  // --- Training Step ---
  trainStep(x: tf.Tensor2D, y: tf.Tensor2D): tf.Scalar {
    const trainFn = (): tf.Scalar =>
      tf.tidy(() => {
        const {logits} = this.forward(x, true);
        const logits2d = logits.reshape([-1, this.config.vocabSize]);
        const targetsFlat = y.reshape([-1]).toInt();

        // Manual sparse cross-entropy: -log softmax at target positions
        const logProbs = tf.logSoftmax(logits2d);
        const oneHot = tf.oneHot(targetsFlat, this.config.vocabSize);
        const nll = tf.sum(logProbs.mul(oneHot), 1).neg();
        return tf.mean(nll) as tf.Scalar;
      });

    const {value, grads} = this.optimizer.computeGradients(
      trainFn,
      this.trainableVars,
    );

    // Filter null grads (unused vars)
    const validGrads: {name: string; tensor: tf.Tensor}[] = [];
    const varsToUpdate: tf.Variable[] = [];

    for (const v of this.trainableVars) {
      if (grads[v.name] != null) {
        validGrads.push({name: v.name, tensor: grads[v.name]});
        varsToUpdate.push(v);
      }
    }

    if (validGrads.length === 0) {
      value.dispose();
      throw new Error('No gradients computed');
    }

    const gradTensors = validGrads.map((g) => g.tensor);
    const clipped = this.clipGradients(gradTensors, this.config.maxGradNorm);

    const gradientMap: any = {};
    for (let i = 0; i < varsToUpdate.length; i++) {
      gradientMap[varsToUpdate[i].name] = clipped[i];
    }

    this.optimizer.applyGradients(gradientMap);

    // Cleanup
    tf.dispose(grads);
    tf.dispose(clipped);

    return value as tf.Scalar;
  }

  // --- Inference with KV Cache ---
  async generate(
    startIds: number[],
    {
      generateLength,
      temperature,
      topK,
      topP,
      penaltyLookback,
      repetitionPenalty,
    }: GenerationConfig,
  ): Promise<number[]> {
    const currentIds = [...startIds];

    // We keep 'cache' on the GPU. It starts undefined.
    let cache: KVCache | undefined = undefined;

    // First, Process the Prompt (Prefill)
    // We run the whole prompt once to generate the initial KV Cache
    const nextInput = tf.tensor2d([startIds], [1, startIds.length], 'int32');

    // Within a tidy, we get the first logits and the initial cache
    // eslint-disable-next-line prefer-const
    let {nextTokenId, newCache} = tf.tidy(() => {
      const {logits, newCache} = this.forward(nextInput, false, undefined);
      // Take the very last token's logits
      const lastLogit = logits
        .slice([0, logits.shape[1] - 1, 0], [1, 1, -1])
        .squeeze();
      return {nextTokenId: lastLogit, newCache};
    });

    // We can dispose the input tensor now
    nextInput.dispose();
    cache = newCache; // Keep this alive! Do not dispose yet.

    // Generation Loop
    for (let i = 0; i < generateLength; i++) {
      // 1. Sampling (CPU side mostly, but minimal transfer)
      // We kept 'nextTokenId' as a tensor from the previous block
      const lookback = Math.min(penaltyLookback, currentIds.length);
      const recentIds = currentIds.slice(-lookback);
      const safeTemp = Math.max(1e-4, temperature);
      const vocabSize = nextTokenId.shape[0];
      const actualK = Math.max(1, Math.min(topK, vocabSize));

      const {values, indices} = tf.tidy(() => {
        let logits = nextTokenId;
        if (recentIds.length > 0) {
          const penaltyUpdates = tf.fill(
            [recentIds.length],
            repetitionPenalty,
            'float32',
          );
          const penaltyIndices = tf.tensor2d(
            recentIds,
            [recentIds.length, 1],
            'int32',
          );
          const penaltyMask = tf.scatterND(
            penaltyIndices,
            penaltyUpdates,
            logits.shape,
          );
          logits = logits.sub(penaltyMask);
        }

        const scaled = logits.div(safeTemp);
        return tf.topk(scaled, actualK, true);
      });

      const [topVals, topIdx] = await Promise.all([
        values.data(),
        indices.data(),
      ]);
      values.dispose();
      indices.dispose();
      nextTokenId.dispose();

      const sampledId = sampleTopPFromTopK(
        topVals as Float32Array,
        topIdx as Int32Array,
        topP,
      );
      currentIds.push(sampledId);

      // Stop if needed (optional EoS check here)

      // 2. Prepare next step (Optimized)
      // We only feed the *single new token* into the model
      const inputTensor = tf.tensor2d([[sampledId]], [1, 1], 'int32');

      const nextStep = tf.tidy(() => {
        const {logits, newCache} = this.forward(inputTensor, false, cache);
        // logits shape is [1, 1, vocab]
        const nextLogits = logits.squeeze([0, 1]);
        return {logits: nextLogits, cache: newCache};
      });

      inputTensor.dispose();

      // Dispose old cache tensors! Important to prevent memory leak
      if (cache) {
        cache.forEach((c) => {
          c.k.dispose();
          c.v.dispose();
        });
      }

      cache = nextStep.cache;
      nextTokenId = nextStep.logits;

      if (i % 5 === 0) await tf.nextFrame();
    }

    // Cleanup final tensors
    if (nextTokenId) nextTokenId.dispose();
    if (cache)
      cache.forEach((c) => {
        c.k.dispose();
        c.v.dispose();
      });

    return currentIds;
  }

  // --- Sub-layers ---

  private layerNorm(x: tf.Tensor, norm: NormParams): tf.Tensor {
    const moments = tf.moments(x, -1, true);
    return x
      .sub(moments.mean)
      .div(tf.sqrt(moments.variance.add(1e-5)))
      .mul(norm.g)
      .add(norm.b);
  }

  private selfAttention(
    x: tf.Tensor,
    block: TransformerBlock,
    seqLen: number,
    layerCache?: {k: tf.Tensor; v: tf.Tensor},
  ): {out: tf.Tensor; k: tf.Tensor; v: tf.Tensor} {
    const {dModel, nHeads} = this.config;
    const headSize = dModel / nHeads;
    const batchSize = x.shape[0];

    // Q, K, V Projections
    // x shape: [batch, seqLen (could be 1 during gen), dModel]
    const x2d = x.reshape([-1, dModel]);

    const qRaw = tf.matMul(x2d, block.attn.Wq);
    const kRaw = tf.matMul(x2d, block.attn.Wk);
    const vRaw = tf.matMul(x2d, block.attn.Wv);

    const splitHeads = (t: tf.Tensor, len: number) =>
      t.reshape([batchSize, len, nHeads, headSize]).transpose([0, 2, 1, 3]);

    const Q = splitHeads(qRaw, seqLen); // [B, nHeads, seqLen, headSize]
    let K = splitHeads(kRaw, seqLen);
    let V = splitHeads(vRaw, seqLen);

    // KV Cache Concatenation
    if (layerCache) {
      // Concatenate along the sequence dimension (axis 2)
      // Cache: [B, nHeads, oldSeqLen, headSize]
      K = tf.concat([layerCache.k, K], 2);
      V = tf.concat([layerCache.v, V], 2);
    }

    // Scaled Dot-Product Attention
    // Q: [B, H, qLen, D], KT: [B, H, D, kLen] -> Scores: [B, H, qLen, kLen]
    let scores = tf.matMul(Q, K, false, true).div(Math.sqrt(headSize));

    // Causal Masking
    // We only need to mask if we are processing more than 1 token at once (training or prefill)
    // If qLen (seqLen) == 1 and we have cache, we are attending to the past, which is all valid.
    if (seqLen > 1) {
      const mask = this.getCausalMask(seqLen);
      scores = scores.add(mask);
    }

    const attention = tf.matMul(tf.softmax(scores), V); // [B, H, qLen, D]

    const merged = attention
      .transpose([0, 2, 1, 3]) // [B, qLen, H, D]
      .reshape([batchSize, seqLen, dModel]);

    const merged2d = merged.reshape([-1, dModel]);
    const out = tf
      .matMul(merged2d, block.attn.Wo)
      .reshape([batchSize, seqLen, dModel]);

    return {out, k: K, v: V};
  }

  private feedForward(x: tf.Tensor, block: TransformerBlock): tf.Tensor {
    const {dModel} = this.config;
    const xShp = x.shape;
    const x2d = x.reshape([-1, dModel]);

    // Use GELU instead of ReLU for modern GPT performance
    const h = gelu(tf.matMul(x2d, block.mlp.W1).add(block.mlp.b1));
    const out2d = tf.matMul(h, block.mlp.W2).add(block.mlp.b2);

    return out2d.reshape(xShp);
  }

  // --- Utilities ---

  private getCausalMask(seqLen: number): tf.Tensor2D {
    const maxLen = this.config.maxLen;
    if (seqLen > maxLen) {
      throw new Error(`Requested seqLen ${seqLen} exceeds maxLen ${maxLen}`);
    }

    const cached = this.maskCache.get(maxLen);
    if (cached) {
      if (seqLen === maxLen) return cached;
      return cached.slice([0, 0], [seqLen, seqLen]);
    }

    const mask = tf.tidy(() => {
      const ones = tf.ones([maxLen, maxLen]);
      // Lower triangular part is kept (set to 0 for adding), upper is -1e9
      const lower = tf.linalg.bandPart(ones, -1, 0);
      return tf.scalar(-1e9).mul(ones.sub(lower));
    }) as tf.Tensor2D;

    const kept = tf.keep(mask);
    this.maskCache.set(maxLen, kept);
    return seqLen === maxLen ? kept : kept.slice([0, 0], [seqLen, seqLen]);
  }

  private maybeDropout(x: tf.Tensor, training: boolean): tf.Tensor {
    if (!training || this.config.dropout <= 0) return x;
    return tf.dropout(x, this.config.dropout);
  }

  private clipGradients(grads: tf.Tensor[], clipNorm: number): tf.Tensor[] {
    return tf.tidy(() => {
      let sum = tf.scalar(0);
      for (const g of grads) {
        sum = sum.add(tf.sum(tf.square(g)));
      }
      const globalNorm = tf.sqrt(sum);
      const denom = tf.maximum(globalNorm, tf.scalar(clipNorm));
      return grads.map((g) => g.mul(clipNorm).div(denom));
    });
  }

  dispose() {
    // Dispose all variables
    this.trainableVars.forEach((v) => v.dispose());
    this.maskCache.forEach((m) => m.dispose());
    this.optimizer.dispose();
  }
}

export class ModelRunner {
  private gpuData: tf.Tensor1D | null = null;
  private model: GPT | null = null;

  async initBackend() {
    await tf.setBackend('webgpu');
    await tf.ready();
    return tf.getBackend();
  }

  createModel(config: GPTConfig) {
    if (this.model) this.model.dispose();
    this.model = new GPT(config);
  }

  async uploadCorpus(tokenPath: string) {
    if (this.gpuData) this.gpuData.dispose();
    const response = await fetch(tokenPath);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch corpus at ${tokenPath} (${response.status})`,
      );
    }

    const buffer = await response.arrayBuffer();
    // Convert stored uint16 tokens into int32 tensor for TFJS
    const tokens16 = new Uint16Array(buffer);
    const tokens32 = Int32Array.from(tokens16);
    this.gpuData = tf.tensor1d(tokens32, 'int32');
  }

  async trainStep(batchSize: number, maxLen: number) {
    const model = this.requireModel();
    const data = this.requireCorpus();
    const dataLen = data.shape[0];
    if (dataLen <= maxLen + 1) {
      throw new Error(
        `Corpus too small for a maxLen of ${maxLen}. Need at least ${
          maxLen + 2
        } tokens, have ${dataLen}.`,
      );
    }

    // PERFORMANCE FIX:
    // Calculate indices entirely on GPU to prevent CPU-GPU sync/upload bottleneck.
    const {xs, ys} = tf.tidy(() => {
      const maxOffset = dataLen - maxLen - 1;

      // 1. Generate random start positions on GPU
      const startIndices = tf.randomUniform([batchSize], 0, maxOffset, 'int32');

      // 2. Create offsets [0, 1, ... maxLen-1]
      const offsets = tf.range(0, maxLen, 1, 'int32');

      // 3. Broadcast add: [Batch, 1] + [1, Len] = [Batch, Len]
      const gatherIndices = startIndices
        .expandDims(1)
        .add(offsets.expandDims(0));

      const xFlat = data.gather(
        gatherIndices.reshape([batchSize * maxLen]) as tf.Tensor1D,
      );
      const xs = xFlat.reshape([batchSize, maxLen]) as tf.Tensor2D;

      const yFlat = data.gather(
        gatherIndices
          .add(tf.scalar(1, 'int32'))
          .reshape([batchSize * maxLen]) as tf.Tensor1D,
      );
      const ys = yFlat.reshape([batchSize, maxLen]) as tf.Tensor2D;

      return {xs, ys};
    });

    const lossTensor = model.trainStep(xs, ys);

    // Dispose batch tensors
    xs.dispose();
    ys.dispose();

    // Async data download so we don't block the UI thread completely
    const lossVal = (await lossTensor.data())[0];
    lossTensor.dispose();
    return lossVal;
  }

  async generate(startIds: number[], generation: GenerationConfig) {
    return this.requireModel().generate(startIds, generation);
  }

  private requireModel(): GPT {
    if (!this.model) throw new Error('Model not initialized');
    return this.model;
  }

  private requireCorpus(): tf.Tensor1D {
    if (!this.gpuData) throw new Error('No corpus');
    return this.gpuData;
  }
}

function sampleTopPFromTopK(
  values: Float32Array,
  indices: Int32Array,
  topP: number,
): number {
  const nucleus = Math.min(1, Math.max(1e-6, topP));
  if (values.length === 0 || indices.length === 0) {
    throw new Error('No logits provided for sampling');
  }

  // Convert to probabilities with standard softmax trick on the top-k slice.
  const maxLogit = values[0];
  const expVals = new Float32Array(values.length);
  let totalExp = 0;
  for (let i = 0; i < values.length; i++) {
    const val = Math.exp(values[i] - maxLogit);
    expVals[i] = val;
    totalExp += val;
  }

  // Apply nucleus cutoff
  const probs = expVals.map((v) => v / totalExp);
  let cumulative = 0;
  let cutoff = probs.length;
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i];
    if (cumulative >= nucleus) {
      cutoff = i + 1;
      break;
    }
  }

  const mass = probs.slice(0, cutoff).reduce((a, b) => a + b, 0);
  const r = Math.random() * mass;
  let acc = 0;
  for (let i = 0; i < cutoff; i++) {
    acc += probs[i];
    if (r <= acc) return indices[i];
  }

  return indices[cutoff - 1];
}

// Approximate GELU used by GPT-style MLPs
function gelu(x: tf.Tensor): tf.Tensor {
  // 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 x^3)))
  return tf.tidy(() => {
    const c = tf.scalar(0.044715);
    const sqrtTwoOverPi = tf.scalar(Math.sqrt(2 / Math.PI));
    const x3 = x.mul(x).mul(x);
    const inner = x.add(c.mul(x3)).mul(sqrtTwoOverPi);
    const t = tf.tanh(inner);
    const one = tf.scalar(1);
    return x.mul(0.5).mul(one.add(t));
  });
}
