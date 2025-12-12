import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';

interface GPTConfig {
  vocabSize: number;
  dModel: number;
  nHeads: number;
  nLayers: number;
  maxLen: number;
  dropout: number;
  learningRate: number;
  maxGradNorm: number;
}

interface GenerationConfig {
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

class GPT {
  private config: GPTConfig;
  private tokenEmbedding!: tf.Variable;
  private positionEmbedding!: tf.Variable;
  public blocks: TransformerBlock[];
  private ln_f!: NormParams;
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
    this.optimizer = tf.train.adam(this.config.learningRate);
  }
  private initWeights() {
    const {vocabSize, dModel, nLayers, maxLen} = this.config;
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
    this.refreshTrainables();
  }

  private refreshTrainables() {
    this.trainableVars = [
      this.tokenEmbedding,
      this.positionEmbedding,
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

  forward(
    indices: tf.Tensor2D,
    training = false,
    cache?: KVCache,
  ): {logits: tf.Tensor3D; newCache?: KVCache} {
    return tf.tidy(() => {
      const batchSize = indices.shape[0];
      const seqLen = indices.shape[1];
      const tokEmb = tf.gather(this.tokenEmbedding, indices);

      let posEmb: tf.Tensor;
      if (cache) {
        const startPos = cache?.[0]?.k.shape[2] ?? 0;
        if (startPos + seqLen > this.config.maxLen) {
          throw new Error(
            `Context overflow: pos ${startPos}+${seqLen} > maxLen ${this.config.maxLen}`,
          );
        }
        posEmb = this.positionEmbedding
          .slice([startPos, 0], [seqLen, -1])
          .expandDims(0);
      } else {
        posEmb = this.positionEmbedding.slice([0, 0], [seqLen, -1]);
      }

      let x = tokEmb.add(posEmb);
      x = this.maybeDropout(x, training);

      const newCache: KVCache = [];

      // 2. Transformer Blocks
      for (let i = 0; i < this.blocks.length; i++) {
        const block = this.blocks[i];
        const ln1 = this.layerNorm(x, block.ln1);
        const layerCache = cache ? cache[i] : undefined;
        const {
          out: attn,
          k,
          v,
        } = this.selfAttention(ln1, block, seqLen, training, layerCache);

        if (cache) newCache.push({k, v});

        const attnOut = this.maybeDropout(attn, training);
        x = x.add(attnOut);

        const ln2 = this.layerNorm(x, block.ln2);
        let ff = this.feedForward(ln2, block);
        ff = this.maybeDropout(ff, training);
        x = x.add(ff);
      }

      x = this.layerNorm(x, this.ln_f);
      const x2d = x.reshape([-1, this.config.dModel]);
      const logits2d = tf.matMul(x2d, this.tokenEmbedding, false, true);
      const logits = logits2d.reshape([
        batchSize,
        seqLen,
        this.config.vocabSize,
      ]) as tf.Tensor3D;

      return {logits, newCache: cache ? newCache : undefined};
    });
  }

  trainStep(x: tf.Tensor2D, y: tf.Tensor2D): tf.Scalar {
    const trainFn = (): tf.Scalar =>
      tf.tidy(() => {
        const {logits} = this.forward(x, true);
        const logits2d = logits.reshape([-1, this.config.vocabSize]);
        const targetsFlat = y.reshape([-1]).toInt();
        const V = this.config.vocabSize;
        const N = targetsFlat.size;
        const logProbs = tf.logSoftmax(logits2d);
        const flatLogProbs = logProbs.reshape([N * V]);
        const rowOffsets = tf
          .range(0, N, 1, 'int32')
          .mul(tf.scalar(V, 'int32'));
        const flatIdx = rowOffsets.add(targetsFlat);
        const targetLogProbs = tf.gather(flatLogProbs, flatIdx);
        return tf.neg(tf.mean(targetLogProbs)) as tf.Scalar;
      });

    const {value, grads} = this.optimizer.computeGradients(
      trainFn,
      this.trainableVars,
    );

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
    tf.dispose(grads);
    tf.dispose(clipped);
    return value;
  }

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
    let cache: KVCache | undefined = undefined;
    const nextInput = tf.tensor2d([startIds], [1, startIds.length], 'int32');

    // eslint-disable-next-line prefer-const
    let {nextTokenId, newCache} = tf.tidy(() => {
      const {logits, newCache} = this.forward(nextInput, false, []);
      const lastLogit = logits
        .slice([0, logits.shape[1] - 1, 0], [1, 1, -1])
        .squeeze();
      return {nextTokenId: lastLogit, newCache};
    });

    nextInput.dispose();
    cache = newCache;

    for (let i = 0; i < generateLength; i++) {
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

      const filtered = filterTokenFromTopK(
        topVals as Float32Array,
        topIdx as Int32Array,
        0, // <unk> is always id 0 in our tokenizer
      );

      const sampledId = sampleTopPFromTopK(
        filtered.values,
        filtered.indices,
        topP,
      );
      currentIds.push(sampledId);
      const inputTensor = tf.tensor2d([[sampledId]], [1, 1], 'int32');
      const nextStep = tf.tidy(() => {
        const {logits, newCache} = this.forward(inputTensor, false, cache);
        const nextLogits = logits.squeeze([0, 1]);
        return {logits: nextLogits, cache: newCache};
      });

      inputTensor.dispose();

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

    if (nextTokenId) nextTokenId.dispose();
    if (cache)
      cache.forEach((c) => {
        c.k.dispose();
        c.v.dispose();
      });

    return currentIds;
  }

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
    training: boolean,
    layerCache?: {k: tf.Tensor; v: tf.Tensor},
  ): {out: tf.Tensor; k: tf.Tensor; v: tf.Tensor} {
    const {dModel, nHeads} = this.config;
    const headSize = dModel / nHeads;
    const batchSize = x.shape[0];

    const x2d = x.reshape([-1, dModel]);
    const qRaw = tf.matMul(x2d, block.attn.Wq);
    const kRaw = tf.matMul(x2d, block.attn.Wk);
    const vRaw = tf.matMul(x2d, block.attn.Wv);
    const qLen = seqLen;
    const oldLen = layerCache ? layerCache.k.shape[2]! : 0;
    const kLen = oldLen + qLen;

    const splitHeads = (t: tf.Tensor, len: number) =>
      t.reshape([batchSize, len, nHeads, headSize]).transpose([0, 2, 1, 3]);

    const Q = splitHeads(qRaw, seqLen);
    let K = splitHeads(kRaw, seqLen);
    let V = splitHeads(vRaw, seqLen);
    if (layerCache) {
      K = tf.concat([layerCache.k, K], 2);
      V = tf.concat([layerCache.v, V], 2);
    }

    let scores = tf.matMul(Q, K, false, true).div(Math.sqrt(headSize));
    if (kLen > 1) {
      const full = this.getCausalMask(kLen); // [kLen, kLen]
      const mask = full.slice([oldLen, 0], [qLen, kLen]); // [qLen, kLen]
      scores = scores.add(mask);
    }
    let att = tf.softmax(scores);
    att = this.maybeDropout(att, training);
    const attention = tf.matMul(att, V);
    const merged = attention
      .transpose([0, 2, 1, 3])
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
    const h = gelu(tf.matMul(x2d, block.mlp.W1).add(block.mlp.b1));
    const out2d = tf.matMul(h, block.mlp.W2).add(block.mlp.b2);
    return out2d.reshape(xShp);
  }

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
    const {xs, ys} = tf.tidy(() => {
      const maxOffset = dataLen - maxLen - 1;
      const startIndices = tf.randomUniform(
        [batchSize],
        0,
        maxOffset + 1,
        'int32',
      );
      const offsets = tf.range(0, maxLen, 1, 'int32');
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
    xs.dispose();
    ys.dispose();
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
  const maxLogit = values[0];
  const expVals = new Float32Array(values.length);
  let totalExp = 0;
  for (let i = 0; i < values.length; i++) {
    const val = Math.exp(values[i] - maxLogit);
    expVals[i] = val;
    totalExp += val;
  }
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

function filterTokenFromTopK(
  values: Float32Array,
  indices: Int32Array,
  bannedId: number,
): {values: Float32Array; indices: Int32Array} {
  if (values.length !== indices.length) {
    throw new Error('TopK values/indices length mismatch');
  }

  let keepCount = 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] !== bannedId) keepCount++;
  }
  if (keepCount === indices.length || keepCount === 0) return {values, indices};

  const filteredValues = new Float32Array(keepCount);
  const filteredIndices = new Int32Array(keepCount);
  let w = 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] === bannedId) continue;
    filteredValues[w] = values[i];
    filteredIndices[w] = indices[i];
    w++;
  }
  return {values: filteredValues, indices: filteredIndices};
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
