import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const LN_EPS = 1e-5;

const k = 0.044715;
const sqrt2OverPi = 0.7978845608028654; // sqrt(2/pi)

const gelu = (x: number) =>
  0.5 * x * (1 + Math.tanh(sqrt2OverPi * (x + k * x * x * x)));

const geluDerivative = (x: number) => {
  const tanhInner = Math.tanh(sqrt2OverPi * (x + k * x * x * x));
  return (
    0.5 * (1 + tanhInner) +
    0.5 * x * (1 - tanhInner * tanhInner) * (sqrt2OverPi * (1 + 3 * k * x * x))
  );
};

type Layer = {
  size: number;
  prevSize: number;
  values: Float32Array; // Activations
  deltas: Float32Array; // Errors (dL/dz)

  // Parameters
  biases: Float32Array;
  weights: Float32Array;

  // Gradient Accumulators (The "Bucket")
  biasGrads: Float32Array;
  weightGrads: Float32Array;

  // Adam Optimizer Cache
  wM: Float32Array;
  wV: Float32Array;
  bM: Float32Array;
  bV: Float32Array;

  probs: Float32Array;

  // LayerNorm + GELU (hidden layers only)
  preAct?: Float32Array;
  norm?: Float32Array;
  lnGamma?: Float32Array;
  lnBeta?: Float32Array;
  lnGammaGrads?: Float32Array;
  lnBetaGrads?: Float32Array;
  lnGammaM?: Float32Array;
  lnGammaV?: Float32Array;
  lnBetaM?: Float32Array;
  lnBetaV?: Float32Array;
  lnInvStd?: number;
};

export class NeuralNetwork {
  readonly layers: Layer[];
  constructor(layerSizes: number[]) {
    this.layers = [];

    for (let i = 0; i < layerSizes.length; i++) {
      const size = layerSizes[i];
      const prevSize = i === 0 ? 0 : layerSizes[i - 1];
      const wSize = size * prevSize;
      const isHidden = i > 0 && i < layerSizes.length - 1;

      const layer: Layer = {
        size,
        prevSize,
        values: new Float32Array(size),
        deltas: new Float32Array(size),

        biases: new Float32Array(size),
        biasGrads: new Float32Array(size), // NEW

        weights: new Float32Array(wSize),
        weightGrads: new Float32Array(wSize), // NEW

        probs: new Float32Array(size),
        wM: new Float32Array(wSize),
        wV: new Float32Array(wSize),
        bM: new Float32Array(size),
        bV: new Float32Array(size),
      };

      if (isHidden) {
        layer.preAct = new Float32Array(size);
        layer.norm = new Float32Array(size);
        layer.lnGamma = new Float32Array(size);
        layer.lnBeta = new Float32Array(size);
        layer.lnGammaGrads = new Float32Array(size);
        layer.lnBetaGrads = new Float32Array(size);
        layer.lnGammaM = new Float32Array(size);
        layer.lnGammaV = new Float32Array(size);
        layer.lnBetaM = new Float32Array(size);
        layer.lnBetaV = new Float32Array(size);
        layer.lnGamma.fill(1);
        layer.lnBeta.fill(0);
        layer.lnInvStd = 1;
      }

      if (i > 0) {
        const limit = Math.sqrt(6 / (prevSize + size));
        for (let j = 0; j < layer.weights.length; j++) {
          layer.weights[j] = (Math.random() * 2 - 1) * limit;
        }
      }
      this.layers.push(layer);
    }
  }
  forward(input: Float32Array): Float32Array {
    const {layers} = this;
    const inputLayer = layers[0];
    inputLayer.values.set(input);

    for (let l = 1; l < layers.length; l++) {
      const curr = layers[l];
      const prev = layers[l - 1];

      // Unroll variables for speed
      const {size, prevSize, weights, biases, values} = curr;
      const prevVals = prev.values;
      const isOutput = l === layers.length - 1;

      let wPtr = 0;

      for (let j = 0; j < size; j++) {
        let sum = biases[j];
        for (let k = 0; k < prevSize; k++) {
          sum += prevVals[k] * weights[wPtr++];
        }
        if (isOutput) {
          values[j] = sum;
        } else if (curr.preAct) {
          curr.preAct[j] = sum;
        }
      }

      if (
        !isOutput &&
        curr.preAct &&
        curr.norm &&
        curr.lnGamma &&
        curr.lnBeta
      ) {
        let mean = 0;
        for (let j = 0; j < size; j++) mean += curr.preAct[j];
        mean /= size;

        let varSum = 0;
        for (let j = 0; j < size; j++) {
          const diff = curr.preAct[j] - mean;
          varSum += diff * diff;
        }

        const invStd = 1 / Math.sqrt(varSum / size + LN_EPS);
        curr.lnInvStd = invStd;

        for (let j = 0; j < size; j++) {
          const normalized = (curr.preAct[j] - mean) * invStd;
          curr.norm[j] = normalized;
          const lnOut = normalized * curr.lnGamma[j] + curr.lnBeta[j];
          values[j] = gelu(lnOut);
        }
      }
    }
    return layers[layers.length - 1].values;
  }

  predictProbs(input: Float32Array): Float32Array {
    const {layers} = this;
    const logits = this.forward(input);
    const last = layers[layers.length - 1];
    const {probs, size} = last;

    let maxLogit = -Infinity;
    for (let i = 0; i < size; i++)
      if (logits[i] > maxLogit) maxLogit = logits[i];

    let sum = 0;
    for (let i = 0; i < size; i++) {
      const val = Math.exp(logits[i] - maxLogit);
      probs[i] = val;
      sum += val;
    }

    const invSum = 1 / sum;
    for (let i = 0; i < size; i++) probs[i] *= invSum;
    return probs;
  }

  /**
   * 1. ZERO GRADS
   * Call this before starting a new batch.
   */
  zeroGrads() {
    for (let i = 1; i < this.layers.length; i++) {
      this.layers[i].biasGrads.fill(0);
      this.layers[i].weightGrads.fill(0);
      this.layers[i].lnGammaGrads?.fill(0);
      this.layers[i].lnBetaGrads?.fill(0);
    }
  }

  /**
   * 2. BACKWARD (ACCUMULATE)
   * Calculates gradients for ONE sample and adds them to weightGrads/biasGrads.
   * Does NOT update weights.
   */
  backward(input: Float32Array, targetIdx: number): Float32Array {
    const {layers} = this;
    // Forward + softmax
    const probs = this.predictProbs(input);

    const lastIdx = layers.length - 1;
    const lastLayer = layers[lastIdx];

    // Output layer deltas: dL/dz = p - one_hot
    for (let i = 0; i < lastLayer.size; i++) {
      lastLayer.deltas[i] = probs[i] - (i === targetIdx ? 1 : 0);
    }

    // Backprop through all layers down to input
    for (let l = lastIdx; l > 0; l--) {
      const curr = layers[l];
      const prev = layers[l - 1];

      const {size, prevSize, deltas, weights, weightGrads, biasGrads} = curr;

      const prevVals = prev.values;
      const prevDeltas = prev.deltas;

      // Zero prev deltas before accumulating
      prevDeltas.fill(0);

      let wPtr = 0;

      for (let j = 0; j < size; j++) {
        const delta = deltas[j];

        // Bias gradient
        biasGrads[j] += delta;

        // Weight grads and prev layer deltas
        for (let k = 0; k < prevSize; k++) {
          const pVal = prevVals[k];

          prevDeltas[k] += delta * weights[wPtr];
          weightGrads[wPtr] += delta * pVal;

          wPtr++;
        }
      }

      // Backprop through GELU + LayerNorm for hidden layers
      if (prev.lnGamma) {
        this.backpropLayerNormGelu(prev);
      }
    }

    return probs;
  }

  /**
   * 3. UPDATE (ADAM STEP)
   * Uses the accumulated gradients to update weights.
   * Normalizes by batchSize.
   */
  updateWeights(lr: number, batchSize: number, iter: number, clipNorm = 1.0) {
    const {layers} = this;
    const beta1 = 0.9,
      beta2 = 0.999,
      eps = 1e-8;
    const correction1 = 1 - Math.pow(beta1, iter);
    const correction2 = 1 - Math.pow(beta2, iter);

    // We multiply by 1/batchSize once here, instead of inside every division
    const scale = 1.0 / batchSize;
    let globalNormSq = 0;

    for (let l = 1; l < layers.length; l++) {
      const layer = layers[l];
      const {
        size,
        prevSize,
        weightGrads,
        biasGrads,
        lnGammaGrads,
        lnBetaGrads,
      } = layer;

      for (let j = 0; j < size; j++) {
        const g = biasGrads[j] * scale;
        globalNormSq += g * g;
      }

      const wLen = size * prevSize;
      for (let i = 0; i < wLen; i++) {
        const g = weightGrads[i] * scale;
        globalNormSq += g * g;
      }

      if (lnGammaGrads && lnBetaGrads) {
        for (let j = 0; j < size; j++) {
          const gG = lnGammaGrads[j] * scale;
          const gB = lnBetaGrads[j] * scale;
          globalNormSq += gG * gG + gB * gB;
        }
      }
    }

    const totalNorm = Math.sqrt(globalNormSq) + 1e-9;
    const clipCoef = clipNorm > 0 ? Math.min(1, clipNorm / totalNorm) : 1;

    for (let l = 1; l < layers.length; l++) {
      const layer = layers[l];
      const {
        size,
        prevSize,
        weights,
        biases,
        weightGrads,
        biasGrads,
        wM,
        wV,
        bM,
        bV,
        lnGamma,
        lnBeta,
        lnGammaGrads,
        lnBetaGrads,
        lnGammaM,
        lnGammaV,
        lnBetaM,
        lnBetaV,
      } = layer;

      // Update Biases
      for (let j = 0; j < size; j++) {
        const g = biasGrads[j] * scale * clipCoef; // Average the gradient

        bM[j] = beta1 * bM[j] + (1 - beta1) * g;
        bV[j] = beta2 * bV[j] + (1 - beta2) * g * g;

        const mHat = bM[j] / correction1;
        const vHat = bV[j] / correction2;

        biases[j] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
      }

      // Update Weights
      const wLen = size * prevSize;
      for (let i = 0; i < wLen; i++) {
        const g = weightGrads[i] * scale * clipCoef; // Average the gradient

        wM[i] = beta1 * wM[i] + (1 - beta1) * g;
        wV[i] = beta2 * wV[i] + (1 - beta2) * g * g;

        const mHat = wM[i] / correction1;
        const vHat = wV[i] / correction2;

        weights[i] -= (lr * mHat) / (Math.sqrt(vHat) + eps);
      }

      // Update LayerNorm parameters
      if (
        lnGamma &&
        lnBeta &&
        lnGammaGrads &&
        lnBetaGrads &&
        lnGammaM &&
        lnGammaV &&
        lnBetaM &&
        lnBetaV
      ) {
        for (let j = 0; j < size; j++) {
          const gG = lnGammaGrads[j] * scale * clipCoef;
          const gB = lnBetaGrads[j] * scale * clipCoef;

          lnGammaM[j] = beta1 * lnGammaM[j] + (1 - beta1) * gG;
          lnGammaV[j] = beta2 * lnGammaV[j] + (1 - beta2) * gG * gG;
          lnBetaM[j] = beta1 * lnBetaM[j] + (1 - beta1) * gB;
          lnBetaV[j] = beta2 * lnBetaV[j] + (1 - beta2) * gB * gB;

          const gGMHat = lnGammaM[j] / correction1;
          const gGVHat = lnGammaV[j] / correction2;
          const gBMHat = lnBetaM[j] / correction1;
          const gBVHat = lnBetaV[j] / correction2;

          lnGamma[j] -= (lr * gGMHat) / (Math.sqrt(gGVHat) + eps);
          lnBeta[j] -= (lr * gBMHat) / (Math.sqrt(gBVHat) + eps);
        }
      }
    }
  }

  private backpropLayerNormGelu(layer: Layer) {
    const {
      size,
      lnGamma,
      lnBeta,
      norm,
      lnGammaGrads,
      lnBetaGrads,
      lnInvStd,
      deltas,
    } = layer;

    if (
      !lnGamma ||
      !lnBeta ||
      !norm ||
      !lnGammaGrads ||
      !lnBetaGrads ||
      lnInvStd === undefined
    ) {
      return;
    }

    const n = size;
    let sumGradNorm = 0;
    let sumGradNormNorm = 0;

    // dL/d(normalized + affine)
    for (let i = 0; i < n; i++) {
      const lnOut = norm[i] * lnGamma[i] + lnBeta[i];
      const gradY = deltas[i] * geluDerivative(lnOut);
      deltas[i] = gradY;
      lnGammaGrads[i] += gradY * norm[i];
      lnBetaGrads[i] += gradY;
    }

    // Accumulate sums for LayerNorm backward
    for (let i = 0; i < n; i++) {
      const gradNormalized = deltas[i] * lnGamma[i];
      sumGradNorm += gradNormalized;
      sumGradNormNorm += gradNormalized * norm[i];
    }

    const invN = 1 / n;
    const invStd = lnInvStd;
    for (let i = 0; i < n; i++) {
      const gradNormalized = deltas[i] * lnGamma[i];
      const term = n * gradNormalized - sumGradNorm - norm[i] * sumGradNormNorm;
      deltas[i] = invN * invStd * term;
    }
  }
  saveToDisk() {
    const {layers} = this;
    const layerSizes = layers.map((l) => l.size);

    const dir = resolve('.', 'languageModel');
    mkdirSync(dir, {recursive: true});

    const segments: Uint8Array[] = [];
    let totalBytes = 0;
    const append = (arr: Float32Array | Uint32Array) => {
      const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      segments.push(bytes);
      totalBytes += bytes.length;
    };

    const header = new Uint32Array(1 + layerSizes.length);
    header[0] = layerSizes.length;
    for (let i = 0; i < layerSizes.length; i++) {
      header[i + 1] = layerSizes[i];
    }
    append(header);

    for (let l = 1; l < layers.length; l++) {
      const layer = layers[l];
      append(layer.biases);
      append(layer.weights);
      append(layer.wM);
      append(layer.wV);
      append(layer.bM);
      append(layer.bV);

      if (
        layer.lnGamma &&
        layer.lnBeta &&
        layer.lnGammaM &&
        layer.lnGammaV &&
        layer.lnBetaM &&
        layer.lnBetaV
      ) {
        append(layer.lnGamma);
        append(layer.lnBeta);
        append(layer.lnGammaM);
        append(layer.lnGammaV);
        append(layer.lnBetaM);
        append(layer.lnBetaV);
      }
    }

    const out = new Uint8Array(totalBytes);
    let offset = 0;
    for (const segment of segments) {
      out.set(segment, offset);
      offset += segment.length;
    }

    const fileName = `network_${layerSizes.join('x')}.bin`;
    const filePath = resolve(dir, fileName);
    writeFileSync(filePath, out);
    return filePath;
  }
  static loadFromDisk(layerSizes: number[]) {
    const fileName = `network_${layerSizes.join('x')}.bin`;
    const filePath = resolve('.', 'languageModel', fileName);

    if (existsSync(filePath)) {
      console.log(`loading ${filePath}`);
      const bytes = readFileSync(filePath);
      const buffer = bytes.buffer;
      const baseOffset = bytes.byteOffset;
      const header = new Uint32Array(buffer, baseOffset, layerSizes.length + 1);

      let matches = header[0] === layerSizes.length;
      for (let i = 0; matches && i < layerSizes.length; i++) {
        if (header[i + 1] !== layerSizes[i]) matches = false;
      }

      if (matches) {
        const net = new NeuralNetwork(layerSizes);
        let offset = baseOffset + header.byteLength;

        for (let l = 1; l < net.layers.length; l++) {
          const layer = net.layers[l];
          const {size, prevSize} = layer;
          const wSize = size * prevSize;

          layer.biases = new Float32Array(buffer, offset, size);
          offset += layer.biases.byteLength;

          layer.weights = new Float32Array(buffer, offset, wSize);
          offset += layer.weights.byteLength;

          layer.wM = new Float32Array(buffer, offset, wSize);
          offset += layer.wM.byteLength;

          layer.wV = new Float32Array(buffer, offset, wSize);
          offset += layer.wV.byteLength;

          layer.bM = new Float32Array(buffer, offset, size);
          offset += layer.bM.byteLength;

          layer.bV = new Float32Array(buffer, offset, size);
          offset += layer.bV.byteLength;

          const isHidden = l < net.layers.length - 1;
          if (
            isHidden &&
            layer.lnGamma &&
            layer.lnBeta &&
            layer.lnGammaM &&
            layer.lnGammaV &&
            layer.lnBetaM &&
            layer.lnBetaV
          ) {
            layer.lnGamma = new Float32Array(buffer, offset, size);
            offset += layer.lnGamma.byteLength;

            layer.lnBeta = new Float32Array(buffer, offset, size);
            offset += layer.lnBeta.byteLength;

            layer.lnGammaM = new Float32Array(buffer, offset, size);
            offset += layer.lnGammaM.byteLength;

            layer.lnGammaV = new Float32Array(buffer, offset, size);
            offset += layer.lnGammaV.byteLength;

            layer.lnBetaM = new Float32Array(buffer, offset, size);
            offset += layer.lnBetaM.byteLength;

            layer.lnBetaV = new Float32Array(buffer, offset, size);
            offset += layer.lnBetaV.byteLength;
          }
        }
        return net;
      }
    }

    return new NeuralNetwork(layerSizes);
  }
}
