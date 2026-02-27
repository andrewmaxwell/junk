import * as tf from '@tensorflow/tfjs';

export function sampleTopPFromTopK(
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

export function filterTokenFromTopK(
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
export function gelu(x: tf.Tensor): tf.Tensor {
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
