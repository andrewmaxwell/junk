// Full GPT forward pass in vanilla JS. Mirrors the Python/numpy reference math:
// pre-norm transformer, tied embeddings, tanh-approx GELU, LayerNorm eps 1e-5.
//
// Weight layout (per model_config.json): every linear weight W is stored [in, out]
// row-major so that  y = x @ W + b ; tok_emb / pos_emb are [rows, d_model].

const LN_EPS = 1e-5;
const GELU_C = Math.sqrt(2 / Math.PI); // 0.7978845608028654

function gelu(x) {
  // tanh approximation
  return 0.5 * x * (1 + Math.tanh(GELU_C * (x + 0.044715 * x * x * x)));
}

// X: [T, din] row-major. W: [din, dout] row-major. b: [dout] or null. -> [T, dout]
function matmul(X, T, din, W, dout, b) {
  const out = new Float32Array(T * dout);
  for (let t = 0; t < T; t++) {
    const xo = t * din;
    const oo = t * dout;
    for (let j = 0; j < dout; j++) {
      let s = b ? b[j] : 0;
      for (let i = 0; i < din; i++) s += X[xo + i] * W[i * dout + j];
      out[oo + j] = s;
    }
  }
  return out;
}

// LayerNorm over the last dim (d) for each of T rows.
function layerNorm(X, T, d, w, b) {
  const out = new Float32Array(T * d);
  for (let t = 0; t < T; t++) {
    const o = t * d;
    let mean = 0;
    for (let i = 0; i < d; i++) mean += X[o + i];
    mean /= d;
    let varr = 0;
    for (let i = 0; i < d; i++) {
      const dx = X[o + i] - mean;
      varr += dx * dx;
    }
    varr /= d;
    const inv = 1 / Math.sqrt(varr + LN_EPS);
    for (let i = 0; i < d; i++) out[o + i] = (X[o + i] - mean) * inv * w[i] + b[i];
  }
  return out;
}

export function makeModel({ config, tensors }) {
  const { d_model: D, n_layers: L, n_heads: H, head_dim: HD, d_ff: FF, vocab_size: V } = config;
  const scale = 1 / Math.sqrt(HD);
  const g = (name) => tensors.get(name);

  // Forward pass over a sequence of token ids (length T, must be <= block_size).
  // Returns last-position logits plus all intermediates + attention weights.
  function forward(ids) {
    const T = ids.length;
    const tokEmb = g('tok_emb');
    const posEmb = g('pos_emb');

    // token + positional embedding
    let x = new Float32Array(T * D);
    for (let t = 0; t < T; t++) {
      const tk = ids[t];
      for (let k = 0; k < D; k++) x[t * D + k] = tokEmb[tk * D + k] + posEmb[t * D + k];
    }

    const activations = { embeddings: x.slice(), layers: [] };
    const attention = []; // [layer][head][q][k]

    for (let l = 0; l < L; l++) {
      const p = `block.${l}`;
      const ln1 = layerNorm(x, T, D, g(`${p}.ln1.w`), g(`${p}.ln1.b`));
      const q = matmul(ln1, T, D, g(`${p}.attn.W_Q`), D, g(`${p}.attn.b_Q`));
      const k = matmul(ln1, T, D, g(`${p}.attn.W_K`), D, g(`${p}.attn.b_K`));
      const v = matmul(ln1, T, D, g(`${p}.attn.W_V`), D, g(`${p}.attn.b_V`));

      const attnOut = new Float32Array(T * D);
      const layerAtt = [];
      for (let h = 0; h < H; h++) {
        const base = h * HD;
        const headAtt = [];
        for (let qi = 0; qi < T; qi++) {
          // causal: only attend to keys 0..qi
          const scores = new Float32Array(qi + 1);
          let max = -Infinity;
          for (let kj = 0; kj <= qi; kj++) {
            let s = 0;
            for (let dd = 0; dd < HD; dd++) s += q[qi * D + base + dd] * k[kj * D + base + dd];
            s *= scale;
            scores[kj] = s;
            if (s > max) max = s;
          }
          let sum = 0;
          for (let kj = 0; kj <= qi; kj++) {
            const e = Math.exp(scores[kj] - max);
            scores[kj] = e;
            sum += e;
          }
          const row = new Array(T).fill(0);
          for (let kj = 0; kj <= qi; kj++) {
            const pjk = scores[kj] / sum;
            row[kj] = pjk;
            for (let dd = 0; dd < HD; dd++) {
              attnOut[qi * D + base + dd] += pjk * v[kj * D + base + dd];
            }
          }
          headAtt.push(row);
        }
        layerAtt.push(headAtt);
      }
      attention.push(layerAtt);

      // output projection + residual
      const proj = matmul(attnOut, T, D, g(`${p}.attn.W_O`), D, g(`${p}.attn.b_O`));
      for (let i = 0; i < T * D; i++) x[i] += proj[i];
      const residual_mid = x.slice(); // residual after the attention add (for the viz)

      // MLP
      const ln2 = layerNorm(x, T, D, g(`${p}.ln2.w`), g(`${p}.ln2.b`));
      const up = matmul(ln2, T, D, g(`${p}.mlp.up.w`), FF, g(`${p}.mlp.up.b`));
      const mlp_pre = up.slice(); // pre-GELU up-projection (for the viz)
      for (let i = 0; i < up.length; i++) up[i] = gelu(up[i]);
      const down = matmul(up, T, FF, g(`${p}.mlp.down.w`), D, g(`${p}.mlp.down.b`));
      for (let i = 0; i < T * D; i++) x[i] += down[i];

      activations.layers.push({
        ln1, q, k, v, attnOut, residual_mid,
        ln2, mlp_pre, mlp_post: up, residual: x.slice(),
      });
    }

    const xf = layerNorm(x, T, D, g('ln_f.w'), g('ln_f.b'));
    activations.final = xf;

    // tied LM head: logits = xf[last] @ tok_emb^T
    const last = T - 1;
    const logits = new Float32Array(V);
    for (let vi = 0; vi < V; vi++) {
      let s = 0;
      for (let kk = 0; kk < D; kk++) s += xf[last * D + kk] * tokEmb[vi * D + kk];
      logits[vi] = s;
    }

    // ---- logit lens: the model's running guess at each depth ----
    // The standard interpretability trick: apply the FINAL LayerNorm + the tied
    // unembedding to the last position's residual at each stage (raw embedding,
    // then after each block). The top guess starts vague and sharpens with depth,
    // making "more layers = iterative refinement of the prediction" visible.
    // Cheap: a handful of extra V×D dot products per generated token.
    const lnfW = g('ln_f.w'), lnfB = g('ln_f.b');
    function lensTopK(vecFull, lastPos, k) {
      const o = lastPos * D;
      let mean = 0;
      for (let i = 0; i < D; i++) mean += vecFull[o + i];
      mean /= D;
      let varr = 0;
      for (let i = 0; i < D; i++) { const dx = vecFull[o + i] - mean; varr += dx * dx; }
      varr /= D;
      const inv = 1 / Math.sqrt(varr + LN_EPS);
      const nrm = new Float32Array(D);
      for (let i = 0; i < D; i++) nrm[i] = (vecFull[o + i] - mean) * inv * lnfW[i] + lnfB[i];
      const lg = new Float32Array(V);
      let max = -Infinity;
      for (let vi = 0; vi < V; vi++) {
        let s = 0; const e = vi * D;
        for (let kk = 0; kk < D; kk++) s += nrm[kk] * tokEmb[e + kk];
        lg[vi] = s; if (s > max) max = s;
      }
      let sum = 0;
      for (let vi = 0; vi < V; vi++) { const ex = Math.exp(lg[vi] - max); lg[vi] = ex; sum += ex; }
      const top = [];
      for (let n = 0; n < k; n++) {
        let bi = -1, bv = -1;
        for (let vi = 0; vi < V; vi++) if (lg[vi] > bv) { bv = lg[vi]; bi = vi; }
        if (bi < 0) break;
        top.push({ id: bi, prob: bv / sum });
        lg[bi] = -1; // exclude so the next pass finds the runner-up
      }
      return top;
    }
    const LENS_K = 3;
    const lens = [lensTopK(activations.embeddings, last, LENS_K)];
    for (let l = 0; l < L; l++) lens.push(lensTopK(activations.layers[l].residual, last, LENS_K));
    activations.lens = lens;

    return { logits, attention, activations };
  }

  return { forward, config };
}
