// Autoregressive generation with a sliding window, plus sampling (temperature,
// top-k) and a next-token distribution readout.

function softmax(logits, temperature) {
  const t = temperature > 0 ? temperature : 1;
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const out = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp((logits[i] - max) / t);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

function argmax(arr) {
  let bi = 0;
  let bv = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > bv) { bv = arr[i]; bi = i; }
  return bi;
}

// Indices of the top-k entries of `arr` (descending). k<=0 => all indices.
function topkIndices(arr, k) {
  const idx = Array.from(arr.keys());
  idx.sort((a, b) => arr[b] - arr[a]);
  if (k > 0 && k < idx.length) return idx.slice(0, k);
  return idx;
}

export function makeGenerator(model, tokenizer) {
  const blockSize = model.config.block_size;

  let ids = []; // full running sequence (prompt + generated), for display

  function reset(promptText) {
    ids = tokenizer.encode(promptText);
    if (ids.length === 0) ids = [0]; // never feed an empty window
    return ids.slice();
  }

  // Produce the next token. Returns the sampled token plus the full viz payload.
  function step({ temperature, topk }) {
    const window = ids.slice(-blockSize);
    const fwd = model.forward(window);
    const logits = fwd.logits;

    // The model's true (temperature-1) distribution, shown in the output column
    // regardless of the sampling temperature.
    const trueProbs = softmax(logits, 1);

    // Sample: greedy at T<=0, else from the renormalized top-k of softmax(logits/T).
    let sampled;
    if (temperature <= 0) {
      sampled = argmax(logits);
    } else {
      const full = softmax(logits, temperature);
      const keep = topkIndices(full, topk);
      let sum = 0;
      for (const i of keep) sum += full[i];
      let r = Math.random() * sum;
      sampled = keep[keep.length - 1];
      for (const i of keep) { r -= full[i]; if (r <= 0) { sampled = i; break; } }
    }

    ids.push(sampled);

    // top-25 by the true distribution, for the viz output column
    const topOutputs = topkIndices(trueProbs, 25).map((i) => ({
      id: i,
      token: tokenizer.idToToken(i),
      prob: trueProbs[i],
      sampled: i === sampled,
    }));

    return {
      tokenId: sampled,
      token: tokenizer.idToToken(sampled),
      // viz payload
      activations: fwd.activations,
      attention: fwd.attention,
      windowTokens: window.map((id) => tokenizer.idToToken(id)),
      lastPos: window.length - 1,
      topOutputs,
    };
  }

  return {
    reset,
    step,
    get ids() { return ids; },
    get length() { return ids.length; },
  };
}
