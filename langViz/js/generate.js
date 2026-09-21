// Autoregressive generation with a sliding window, plus sampling (temperature,
// min-p / top-k, frequency penalty) and a next-token distribution readout.

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

// Min-p: keep every token whose probability is at least `minp` x the top
// token's. Unlike top-k the cut is data-dependent — a step where the model is
// sure keeps a handful of candidates, an open-ended one keeps hundreds — which
// is both better output and a more honest thing to show on screen.
function minpIndices(probs, minp) {
  let max = 0;
  for (let i = 0; i < probs.length; i++) if (probs[i] > max) max = probs[i];
  const floor = max * minp;
  const keep = [];
  for (let i = 0; i < probs.length; i++) if (probs[i] >= floor) keep.push(i);
  keep.sort((a, b) => probs[b] - probs[a]);
  return keep;
}

export function makeGenerator(model, tokenizer) {
  const blockSize = model.config.block_size;

  let promptLength = 0;
  let ids = []; // full running sequence (prompt + generated), for display

  // Character-fallback pieces: a "##x" continuation or a bare single character.
  // Cached because the repetition penalty asks about every id in the window.
  const wordPiece = new Map();
  function isWordPiece(id) {
    let v = wordPiece.get(id);
    if (v === undefined) {
      const t = tokenizer.idToToken(id);
      v = typeof t === 'string' && (t.startsWith('##') || t.length === 1);
      wordPiece.set(id, v);
    }
    return v;
  }

  function reset(promptText) {
    ids = tokenizer.encode(promptText);
    if (ids.length === 0) ids = [0]; // never feed an empty window
    promptLength = ids.length;
    return ids.slice();
  }

  // Produce the next token. Returns the sampled token plus the full viz payload.
  //
  // `minp` (when > 0) selects the candidate set instead of `topk`. `repPenalty`
  // subtracts a flat logit from whole words already used in the last
  // `repWindow` tokens — it deliberately exempts the character-fallback pieces,
  // since spelling "Melchizedek" needs to reuse letters and penalising them
  // would push the model away from rare names one letter at a time.
  function step({ temperature, topk, minp = 0, repPenalty = 0, repWindow = 48 }) {
    const window = ids.slice(-blockSize);
    const fwd = model.forward(window);
    const logits = fwd.logits;

    // The model's true (temperature-1) distribution, shown in the output column
    // regardless of the sampling temperature or any penalty.
    const trueProbs = softmax(logits, 1);

    // Penalties apply to sampling only, never to the displayed distribution.
    let shaped = logits;
    if (repPenalty > 0) {
      shaped = Float32Array.from(logits);
      for (const id of new Set(ids.slice(-repWindow))) {
        if (!isWordPiece(id)) shaped[id] -= repPenalty;
      }
    }

    // Sample: greedy at T<=0, else from the renormalized candidate set of
    // softmax(shaped/T).
    let sampled;
    let candidates;
    if (temperature <= 0) {
      sampled = argmax(shaped);
      candidates = 1;
    } else {
      const full = softmax(shaped, temperature);
      const keep = minp > 0 ? minpIndices(full, minp) : topkIndices(full, topk);
      candidates = keep.length;
      let sum = 0;
      for (const i of keep) sum += full[i];
      let r = Math.random() * sum;
      sampled = keep[keep.length - 1];
      for (const i of keep) { r -= full[i]; if (r <= 0) { sampled = i; break; } }
    }

    ids.push(sampled);

    // top-25 by the true distribution, for the viz output column
    const order = topkIndices(trueProbs, 0);
    const displayed = order.slice(0, 25);
    // Top-k sampling can select ranks 26–40. Keep that result visible without
    // increasing the renderer's fixed 25-row layout.
    if (!displayed.includes(sampled)) displayed[displayed.length - 1] = sampled;
    const topOutputs = displayed.map((i) => ({
      rank: order.indexOf(i) + 1,
      id: i,
      token: tokenizer.idToToken(i),
      prob: trueProbs[i],
      sampled: i === sampled,
    }));

    return {
      tokenId: sampled,
      token: tokenizer.idToToken(sampled),
      // how many tokens survived the min-p cut this step (viz-friendly: it
      // moves from a handful to hundreds depending on how sure the model is)
      candidates,
      // viz payload
      activations: fwd.activations,
      // which part of the model pushed toward the token it actually produced
      attribution: model.attribute(fwd.activations, sampled),
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
    get generatedCount() { return ids.length - promptLength; },
  };
}
