"""
Offline interpretability pass: label each MLP hidden neuron by what makes it fire.

For every block's post-GELU hidden unit (n_layers x d_ff of them), we run the
*exported* weights over the whole training corpus and record the tokens/contexts
that most strongly activate it. The result is a compact JSON the visualization
loads so you can hover a GELU neuron and see, honestly, what it responds to.

This does NOT retrain or change the model — it reads weights.bin, the same source
of truth parity.py uses, and reuses that identical forward math.

    python3 neuron_labels.py          # writes langViz/neuron_labels.json

Caveat shown in-app: tiny-model neurons are often polysemantic (one unit fires on
several unrelated things). The labels are the honest top activators, not clean
"concepts".
"""

import json
import os
import re

import numpy as np

from parity import load, gelu, layernorm  # reuse the exact loader + math

HERE = os.path.dirname(os.path.abspath(__file__))
BIBLE_PATH = os.path.join(HERE, "..", "jibberjabber", "bible.txt")
OUT_PATH = os.path.join(HERE, "neuron_labels.json")
TOKEN_RE = re.compile(r"[A-Za-z]+|[^A-Za-z\s]")

TOP_K = 24          # candidate activating positions tracked per neuron
N_TRIGGERS = 4      # distinct trigger tokens kept per neuron in the output
CTX_TOKENS = 5      # tokens of left-context shown for the best example
BATCH = 192         # blocks per forward batch


def encode_stream(text, stoi):
    """Encode the whole corpus to ids, keeping the surface token per id so we can
    show readable triggers/contexts later."""
    ids, surface = [], []
    for tok in TOKEN_RE.findall(text):
        if tok in stoi:
            ids.append(stoi[tok]); surface.append(tok)
        else:
            for i, ch in enumerate(tok):
                key = ch if i == 0 else "##" + ch
                ids.append(stoi.get(key, stoi.get("##" + ch, stoi.get(ch, 0))))
                surface.append(key)
    return np.array(ids, dtype=np.int64), surface


def gelu_activations(cfg, W, block_ids):
    """Forward a batch of token blocks [B, T]; return post-GELU hidden activations
    for every layer: list of [B, T, d_ff]. Mirrors parity.forward exactly."""
    np.seterr(all="ignore")
    D = cfg["d_model"]; H = cfg["n_heads"]; HD = cfg["head_dim"]
    B, T = block_ids.shape
    scale = 1.0 / np.sqrt(HD)

    x = W["tok_emb"][block_ids] + W["pos_emb"][:T]          # [B, T, D]
    causal = np.tril(np.ones((T, T), dtype=bool))
    neg = np.float32(-1e30)
    acts = []
    for l in range(cfg["n_layers"]):
        p = f"block.{l}"
        h = layernorm(x, W[f"{p}.ln1.w"], W[f"{p}.ln1.b"])
        q = h @ W[f"{p}.attn.W_Q"] + W[f"{p}.attn.b_Q"]
        k = h @ W[f"{p}.attn.W_K"] + W[f"{p}.attn.b_K"]
        v = h @ W[f"{p}.attn.W_V"] + W[f"{p}.attn.b_V"]
        out = np.zeros_like(x)
        for hd in range(H):
            sl = slice(hd * HD, (hd + 1) * HD)
            att = np.matmul(q[:, :, sl], np.swapaxes(k[:, :, sl], -1, -2)) * scale
            att = np.where(causal, att, neg)
            att = att - att.max(axis=-1, keepdims=True)
            att = np.exp(att)
            att = att / att.sum(axis=-1, keepdims=True)
            out[:, :, sl] = np.matmul(att, v[:, :, sl])
        x = x + (out @ W[f"{p}.attn.W_O"] + W[f"{p}.attn.b_O"])
        h2 = layernorm(x, W[f"{p}.ln2.w"], W[f"{p}.ln2.b"])
        up = gelu(h2 @ W[f"{p}.mlp.up.w"] + W[f"{p}.mlp.up.b"])  # [B, T, d_ff]
        acts.append(up)
        x = x + (up @ W[f"{p}.mlp.down.w"] + W[f"{p}.mlp.down.b"])
    return acts


def main():
    cfg, W = load()
    vocab = cfg["vocab"]
    stoi = {t: i for i, t in enumerate(vocab)}
    L = cfg["n_layers"]; FF = cfg["d_ff"]; T = cfg["block_size"]

    text = open(BIBLE_PATH, encoding="utf-8").read()
    ids, surface = encode_stream(text, stoi)
    n_blocks = len(ids) // T
    ids = ids[: n_blocks * T]
    blocks = ids.reshape(n_blocks, T)
    print(f"corpus: {len(ids):,} tokens -> {n_blocks:,} blocks of {T}")
    print(f"labeling {L}x{FF} = {L * FF:,} MLP neurons")

    # per (layer, neuron): keep running top-K (activation, global_token_index)
    best_act = [np.full((FF, TOP_K), -1e30, dtype=np.float32) for _ in range(L)]
    best_idx = [np.full((FF, TOP_K), -1, dtype=np.int64) for _ in range(L)]

    for b0 in range(0, n_blocks, BATCH):
        b1 = min(n_blocks, b0 + BATCH)
        acts = gelu_activations(cfg, W, blocks[b0:b1])      # list of [B, T, FF]
        # global token index for each (block, pos) in this batch
        gidx = (np.arange(b0, b1)[:, None] * T + np.arange(T)[None, :]).reshape(-1)
        for l in range(L):
            a = acts[l].reshape(-1, FF)                     # [B*T, FF]
            # merge this batch's bests into the running top-K, per neuron
            merged_a = np.concatenate([best_act[l], a.T], axis=1)        # [FF, K+BT]
            merged_i = np.concatenate([best_idx[l], np.broadcast_to(gidx, (FF, gidx.size))], axis=1)
            keep = np.argsort(-merged_a, axis=1)[:, :TOP_K]
            rows = np.arange(FF)[:, None]
            best_act[l] = merged_a[rows, keep]
            best_idx[l] = merged_i[rows, keep]
        if (b0 // BATCH) % 10 == 0:
            print(f"  blocks {b1:,}/{n_blocks:,}")

    def glyph(tok):
        return tok[2:] if tok.startswith("##") else tok

    def context_for(gi):
        lo = max(0, gi - CTX_TOKENS)
        toks = surface[lo: gi + 1]
        # join with simple spacing; glue ## pieces onto the previous token
        s = ""
        for j, tk in enumerate(toks):
            g = glyph(tk)
            if j == 0 or tk.startswith("##"):
                s += g
            elif g in ",.;:!?)]}'\"":
                s += g
            else:
                s += " " + g
        return s.strip()

    layers_out = []
    dead = 0
    for l in range(L):
        neurons = []
        for j in range(FF):
            acts_j = best_act[l][j]
            idxs_j = best_idx[l][j]
            peak = float(acts_j[0])
            if peak < 0.5 or idxs_j[0] < 0:   # effectively never fires
                neurons.append({"t": [], "ctx": "", "peak": round(peak, 2)})
                dead += 1
                continue
            # distinct trigger tokens by frequency among the top activators
            counts = {}
            for gi in idxs_j:
                if gi < 0:
                    continue
                g = glyph(surface[int(gi)])
                counts[g] = counts.get(g, 0) + 1
            triggers = [t for t, _ in sorted(counts.items(), key=lambda kv: -kv[1])][:N_TRIGGERS]
            neurons.append({
                "t": triggers,
                "ctx": context_for(int(idxs_j[0])),
                "peak": round(peak, 2),
            })
        layers_out.append(neurons)
    print(f"done. {dead:,} of {L * FF:,} neurons effectively never fire (peak<0.5)")

    out = {
        "note": "Max-activating tokens per MLP (post-GELU) neuron, over the KJV corpus. "
                "Tiny-model neurons are often polysemantic; these are honest top "
                "activators, not clean concepts.",
        "n_layers": L, "d_ff": FF, "top_k": TOP_K,
        "layers": layers_out,
    }
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    size = os.path.getsize(OUT_PATH)
    print(f"wrote {OUT_PATH} ({size / 1024:.1f} KiB)")


if __name__ == "__main__":
    main()
