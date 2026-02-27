import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import {GPT, type GenerationConfig, type GPTConfig} from './Model';

type GPTCheckpointV1 = {
  format: 'browser-llm-gpt-checkpoint';
  version: 1;
  savedAt: string;
  step: number;
  config: GPTConfig;
  modelWeightCount: number;
  optimizerWeightCount: number;
};

export class ModelRunner {
  private gpuData: tf.Tensor1D | null = null;
  private model: GPT | null = null;
  private checkpointSaveInFlight: Promise<void> | null = null;

  async initBackend() {
    tf.enableProdMode();
    await tf.setBackend('webgpu');
    await tf.ready();
    return tf.getBackend();
  }

  createModel(config: GPTConfig) {
    if (this.model) this.model.dispose();
    this.model = new GPT(config);
  }

  async saveCheckpoint(checkpointKey: string, opts?: {step?: number}) {
    if (this.checkpointSaveInFlight) return this.checkpointSaveInFlight;
    this.checkpointSaveInFlight = this.saveCheckpointImpl(checkpointKey, opts)
      .catch((e) => {
        this.checkpointSaveInFlight = null;
        throw e;
      })
      .finally(() => {
        this.checkpointSaveInFlight = null;
      });
    return this.checkpointSaveInFlight;
  }

  async loadCheckpoint(checkpointKey: string): Promise<GPTCheckpointV1 | null> {
    const model = this.requireModel();
    const url = `indexeddb://${checkpointKey}`;
    const handlers = tf.io.getLoadHandlers(url);
    const handler = handlers[0];
    if (!handler?.load) return null;
    let artifacts: tf.io.ModelArtifacts;
    try {
      artifacts = await handler.load();
      console.log('artifacts', artifacts);
    } catch {
      return null;
    }

    const meta = artifacts.modelTopology as
      | Partial<GPTCheckpointV1>
      | undefined;
    if (
      !meta ||
      meta.format !== 'browser-llm-gpt-checkpoint' ||
      meta.version !== 1 ||
      typeof meta.step !== 'number' ||
      typeof meta.modelWeightCount !== 'number' ||
      typeof meta.optimizerWeightCount !== 'number' ||
      !meta.config
    ) {
      throw new Error('Unrecognized checkpoint format');
    }

    const cur = model.getConfig();
    const cfg = meta.config;
    const sameArch =
      cfg.vocabSize === cur.vocabSize &&
      cfg.dModel === cur.dModel &&
      cfg.nHeads === cur.nHeads &&
      cfg.nLayers === cur.nLayers &&
      cfg.maxLen === cur.maxLen;
    if (!sameArch) return null;

    if (!artifacts.weightSpecs || !artifacts.weightData) {
      throw new Error('Checkpoint missing weights');
    }

    const weightMap = tf.io.decodeWeights(
      artifacts.weightData,
      artifacts.weightSpecs,
    );
    try {
      model.setModelWeights(weightMap);
      const optSpecs = artifacts.weightSpecs.slice(
        meta.modelWeightCount,
        meta.modelWeightCount + meta.optimizerWeightCount,
      );
      if (optSpecs.length > 0) {
        const optWeights = optSpecs.map((s) => {
          const t = weightMap[s.name];
          if (!t) throw new Error(`Missing optimizer weight: ${s.name}`);
          return {name: s.name, tensor: t};
        });
        await model.setOptimizerWeights(optWeights);
      }
    } finally {
      for (const t of Object.values(weightMap)) t.dispose();
    }
    return meta as GPTCheckpointV1;
  }

  async deleteCheckpoint(checkpointKey: string) {
    await tf.io.removeModel(`indexeddb://${checkpointKey}`);
  }

  private async saveCheckpointImpl(
    checkpointKey: string,
    opts?: {step?: number},
  ) {
    const model = this.requireModel();
    const step = opts?.step ?? 0;

    const [modelWeights, optWeights] = await Promise.all([
      Promise.resolve(model.getModelWeights()),
      model.getOptimizerWeights(),
    ]);
    const [modelEnc, optEnc] = await Promise.all([
      tf.io.encodeWeights(modelWeights, 'model'),
      tf.io.encodeWeights(optWeights, 'optimizer'),
    ]);

    const meta: GPTCheckpointV1 = {
      format: 'browser-llm-gpt-checkpoint',
      version: 1,
      savedAt: new Date().toISOString(),
      step,
      config: model.getConfig(),
      modelWeightCount: modelEnc.specs.length,
      optimizerWeightCount: optEnc.specs.length,
    };

    const url = `indexeddb://${checkpointKey}`;
    const handlers = tf.io.getSaveHandlers(url);
    const handler = handlers[0];
    if (!handler?.save) throw new Error('IndexedDB save handler unavailable');
    await handler.save({
      modelTopology: meta,
      weightSpecs: [...modelEnc.specs, ...optEnc.specs],
      weightData: [modelEnc.data, optEnc.data],
      format: meta.format,
      generatedBy: `TensorFlow.js ${tf.version.tfjs}`,
    });
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
