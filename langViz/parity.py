"""
Parity reference for the JS forward pass.

Loads the *exported* float16 weights (weights.bin + model_config.json) and runs
the identical forward math the browser runs (pre-norm transformer, tied
embeddings, tanh-approx GELU, LayerNorm eps 1e-5). weights.bin is the shared
source of truth, so JS and this script must agree within float16 tolerance.

Usage:
    python3 parity.py "Thus saith the LORD"

Then in the browser console (page served over http):
    __parityCheck("Thus saith the LORD")

Compare the printed top-10 (index, token, logit) lists.
"""

import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOKEN_RE = re.compile(r"[A-Za-z]+|[^A-Za-z\s]")
LN_EPS = 1e-5
GELU_C = (2.0 / np.pi) ** 0.5


def load():
    cfg = json.load(open(os.path.join(HERE, "model_config.json")))
    raw = np.fromfile(os.path.join(HERE, "weights.bin"), dtype="<f2")
    tensors = {}
    for t in cfg["tensors"]:
        start = t["offset"] // 2
        arr = raw[start : start + t["length"]].astype(np.float32)
        tensors[t["name"]] = arr.reshape(t["shape"])
    return cfg, tensors


def encode(text, stoi):
    """Char-fallback encoder, identical to train.py / js tokenizer."""
    ids = []
    for tok in TOKEN_RE.findall(text):
        if tok in stoi:
            ids.append(stoi[tok])
            continue
        for i, ch in enumerate(tok):
            key = ch if i == 0 else "##" + ch
            ids.append(stoi.get(key, stoi.get("##" + ch, stoi.get(ch, 0))))
    return ids


def gelu(x):
    return 0.5 * x * (1.0 + np.tanh(GELU_C * (x + 0.044715 * x ** 3)))


def layernorm(x, w, b):
    mean = x.mean(axis=-1, keepdims=True)
    var = x.var(axis=-1, keepdims=True)
    return (x - mean) / np.sqrt(var + LN_EPS) * w + b


def forward(cfg, W, ids):
    # Apple's Accelerate BLAS raises spurious FP-exception flags inside matmul
    # (results are finite/correct); ignore them so the output stays clean.
    np.seterr(all="ignore")
    D = cfg["d_model"]; H = cfg["n_heads"]; HD = cfg["head_dim"]
    T = len(ids)
    scale = 1.0 / np.sqrt(HD)

    x = W["tok_emb"][ids] + W["pos_emb"][:T]            # [T, D]

    causal = np.tril(np.ones((T, T), dtype=bool))
    for l in range(cfg["n_layers"]):
        p = f"block.{l}"
        h = layernorm(x, W[f"{p}.ln1.w"], W[f"{p}.ln1.b"])
        q = h @ W[f"{p}.attn.W_Q"] + W[f"{p}.attn.b_Q"]
        k = h @ W[f"{p}.attn.W_K"] + W[f"{p}.attn.b_K"]
        v = h @ W[f"{p}.attn.W_V"] + W[f"{p}.attn.b_V"]
        # per-head attention
        out = np.zeros((T, D), dtype=np.float32)
        for hd in range(H):
            sl = slice(hd * HD, (hd + 1) * HD)
            att = (q[:, sl] @ k[:, sl].T) * scale       # [T, T]
            att = np.where(causal, att, -np.inf)
            att = att - att.max(axis=-1, keepdims=True)
            att = np.exp(att)
            att = att / att.sum(axis=-1, keepdims=True)
            out[:, sl] = att @ v[:, sl]
        x = x + (out @ W[f"{p}.attn.W_O"] + W[f"{p}.attn.b_O"])

        h2 = layernorm(x, W[f"{p}.ln2.w"], W[f"{p}.ln2.b"])
        up = gelu(h2 @ W[f"{p}.mlp.up.w"] + W[f"{p}.mlp.up.b"])
        x = x + (up @ W[f"{p}.mlp.down.w"] + W[f"{p}.mlp.down.b"])

    x = layernorm(x, W["ln_f.w"], W["ln_f.b"])
    logits = x[-1] @ W["tok_emb"].T                     # tied head, last position
    return logits


def main():
    text = sys.argv[1] if len(sys.argv) > 1 else "Thus saith the LORD"
    cfg, W = load()
    vocab = cfg["vocab"]
    stoi = {t: i for i, t in enumerate(vocab)}
    ids = encode(text, stoi)

    logits = forward(cfg, W, ids)
    order = np.argsort(-logits)[:10]

    print(f"[parity] input text: {text!r}")
    print(f"[parity] input ids : {ids}")
    print("[parity] top-10 logits (index, token, logit):")
    for i in order:
        print(f"  {int(i):4d}  {vocab[int(i)]!r:14s}  {logits[int(i)]:.5f}")


if __name__ == "__main__":
    main()
