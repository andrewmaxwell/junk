"""
Train a tiny word-level GPT on the KJV bible and export compact float16 weights
that a browser can load. Produces:
  - langViz/weights.bin       (all params, float16, little-endian, manifest order)
  - langViz/model_config.json (hyperparams, vocab, tensor manifest)

No web code here. This is only the training/export pipeline.
"""

import json
import math
import os
import re
import struct
import time
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# ----------------------------------------------------------------------------
# Config (these exact hyperparameters are part of the spec)
# ----------------------------------------------------------------------------
# Vocabulary: top-N whole "words" (+ punctuation), plus a character fallback so
# any out-of-vocab word can be spelled out as pieces -> there is no <UNK>.
N_WORDS = int(os.environ.get("N_WORDS", 8000))  # whole-word slots before fallback
VOCAB_SIZE = None         # set once the vocab is built (words + chars + "##" pieces)

D_MODEL = 96
N_LAYERS = 4
N_HEADS = 4
HEAD_DIM = D_MODEL // N_HEADS   # 24
D_FF = 384
BLOCK_SIZE = 64

# Training knobs (not part of the spec)
BATCH_SIZE = 64
LEARNING_RATE = 6e-4
MIN_LR = 6e-5
WARMUP_STEPS = 200
WEIGHT_DECAY = 0.01
MAX_STEPS = int(os.environ.get("MAX_STEPS", 30000))
MIN_STEPS = 3000
SEED = 1337

# Dropout was a config field the model never actually implemented. It only ever
# runs during training (nn.Dropout is identity under .eval()), so it adds no
# parameters, changes nothing in the exported weights, and the browser forward
# pass is unaffected.
DROPOUT = float(os.environ.get("DROPOUT", 0.1))

# Horizon for the cosine decay, separate from the step cap. These used to be the
# same number, so with MAX_STEPS=30000 and early stopping around step ~14k the
# LR only ever fell from 6e-4 to ~3.2e-4 — the run ended before the low-LR
# annealing phase that usually delivers a good share of the final gain.
LR_DECAY_STEPS = int(os.environ.get("LR_DECAY_STEPS", 16000))

# Held-out split. There was none, which meant the only visible signal was
# TRAINING loss — so nobody could tell underfitting from memorisation, and the
# plateau test below was watching the wrong number. The tail of the corpus is
# held out as one contiguous block (not random windows) so no validation
# context ever appears in a training window.
VAL_FRACTION = 0.05
EVAL_EVERY = 250        # steps between validation passes
EVAL_BATCHES = 40       # fixed batches per validation pass (same ones each time)
PATIENCE = 8            # validation passes without improvement before stopping

HERE = os.path.dirname(os.path.abspath(__file__))
BIBLE_PATH = os.path.join(HERE, "..", "jibberjabber", "bible.txt")
WEIGHTS_PATH = os.path.join(HERE, "weights.bin")
CONFIG_PATH = os.path.join(HERE, "model_config.json")

# Convention for exported weight matrices: we store every linear weight in the
# math layout  y = x @ W + b , i.e. W has shape [in_features, out_features].
# nn.Linear stores weight as [out, in], so we transpose on export. The browser
# can therefore read each matrix's shape directly and do plain row-major matmuls.

TOKEN_RE = re.compile(r"[A-Za-z]+|[^A-Za-z\s]")


def tokenize(text):
    """Words (runs of letters, case preserved) and single punctuation chars."""
    return TOKEN_RE.findall(text)


def detokenize(tokens):
    """Join tokens with spaces; no space before punctuation, after open paren, or
    before a '##' continuation piece (which glues onto the previous piece)."""
    out = []
    no_space_before = set(",.;:!?)]}'\"")
    no_space_after = set("([{")
    for i, tok in enumerate(tokens):
        piece = tok[2:] if tok.startswith("##") else tok
        if i == 0:
            out.append(piece)
            continue
        prev = tokens[i - 1]
        if tok.startswith("##") or piece in no_space_before or prev in no_space_after:
            out.append(piece)
        else:
            out.append(" " + piece)
    return "".join(out)


def encode_token(tok, stoi):
    """One surface token -> ids. Whole word if known, else spelled out as the
    first char + '##' continuation pieces (every letter is guaranteed present)."""
    if tok in stoi:
        return [stoi[tok]]
    ids = []
    for i, ch in enumerate(tok):
        key = ch if i == 0 else "##" + ch
        ids.append(stoi.get(key, stoi.get("##" + ch, stoi.get(ch, 0))))
    return ids


def encode(text, stoi):
    out = []
    for t in tokenize(text):
        out.extend(encode_token(t, stoi))
    return out


# ----------------------------------------------------------------------------
# Model
# ----------------------------------------------------------------------------
class CausalSelfAttention(nn.Module):
    def __init__(self):
        super().__init__()
        self.W_Q = nn.Linear(D_MODEL, D_MODEL)
        self.W_K = nn.Linear(D_MODEL, D_MODEL)
        self.W_V = nn.Linear(D_MODEL, D_MODEL)
        self.W_O = nn.Linear(D_MODEL, D_MODEL)
        self.attn_drop = nn.Dropout(DROPOUT)
        self.resid_drop = nn.Dropout(DROPOUT)
        mask = torch.tril(torch.ones(BLOCK_SIZE, BLOCK_SIZE)).view(
            1, 1, BLOCK_SIZE, BLOCK_SIZE
        )
        self.register_buffer("mask", mask)

    def forward(self, x):
        B, T, C = x.shape
        q = self.W_Q(x).view(B, T, N_HEADS, HEAD_DIM).transpose(1, 2)
        k = self.W_K(x).view(B, T, N_HEADS, HEAD_DIM).transpose(1, 2)
        v = self.W_V(x).view(B, T, N_HEADS, HEAD_DIM).transpose(1, 2)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(HEAD_DIM)
        att = att.masked_fill(self.mask[:, :, :T, :T] == 0, float("-inf"))
        att = F.softmax(att, dim=-1)
        att = self.attn_drop(att)
        y = att @ v                                   # [B, nh, T, hd]
        y = y.transpose(1, 2).contiguous().view(B, T, C)
        return self.resid_drop(self.W_O(y))


class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.up = nn.Linear(D_MODEL, D_FF)
        self.down = nn.Linear(D_FF, D_MODEL)
        self.drop = nn.Dropout(DROPOUT)

    def forward(self, x):
        return self.drop(self.down(F.gelu(self.up(x))))


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.ln1 = nn.LayerNorm(D_MODEL)
        self.attn = CausalSelfAttention()
        self.ln2 = nn.LayerNorm(D_MODEL)
        self.mlp = MLP()

    def forward(self, x):
        x = x + self.attn(self.ln1(x))   # pre-norm
        x = x + self.mlp(self.ln2(x))
        return x


class TinyGPT(nn.Module):
    def __init__(self):
        super().__init__()
        self.tok_emb = nn.Embedding(VOCAB_SIZE, D_MODEL)
        self.pos_emb = nn.Embedding(BLOCK_SIZE, D_MODEL)
        self.blocks = nn.ModuleList([Block() for _ in range(N_LAYERS)])
        self.drop = nn.Dropout(DROPOUT)
        self.ln_f = nn.LayerNorm(D_MODEL)
        # tied output embedding: LM head is tok_emb transposed, no separate params.

    def forward(self, idx, targets=None):
        B, T = idx.shape
        pos = torch.arange(T, device=idx.device)
        x = self.drop(self.tok_emb(idx) + self.pos_emb(pos)[None, :, :])
        for blk in self.blocks:
            x = blk(x)
        x = self.ln_f(x)
        logits = x @ self.tok_emb.weight.t()   # tied weights
        loss = None
        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, VOCAB_SIZE), targets.view(-1)
            )
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new_tokens, temperature=None):
        for _ in range(max_new_tokens):
            cond = idx[:, -BLOCK_SIZE:]
            logits, _ = self(cond)
            logits = logits[:, -1, :]
            if temperature is None:        # greedy
                nxt = torch.argmax(logits, dim=-1, keepdim=True)
            else:
                probs = F.softmax(logits / temperature, dim=-1)
                nxt = torch.multinomial(probs, num_samples=1)
            idx = torch.cat([idx, nxt], dim=1)
        return idx


# ----------------------------------------------------------------------------
# Data
# ----------------------------------------------------------------------------
def build_data():
    with open(BIBLE_PATH, "r", encoding="utf-8") as f:
        text = f.read()
    tokens = tokenize(text)
    print(f"corpus: {len(tokens):,} tokens")

    counts = Counter(tokens)
    top = [tok for tok, _ in counts.most_common(N_WORDS)]
    vocab = ["<UNK>"] + top
    present = set(vocab)
    # character fallback: every letter that appears, both as a standalone token
    # (word-initial) and as a '##' continuation piece (word-internal).
    letters = sorted({ch for tok in counts if tok.isalpha() for ch in tok})
    for L in letters:
        if L not in present:
            vocab.append(L); present.add(L)
    for L in letters:
        cont = "##" + L
        if cont not in present:
            vocab.append(cont); present.add(cont)
    # safety: every single-character surface token (punctuation, digits, ...)
    # must exist as its own id so nothing ever falls back to <UNK>.
    for s in sorted({tok for tok in counts if len(tok) == 1}):
        if s not in present:
            vocab.append(s); present.add(s)
    stoi = {tok: i for i, tok in enumerate(vocab)}

    covered = sum(n for t, n in counts.items() if t in present)
    print(f"whole-word coverage: {covered / len(tokens) * 100:.1f}% "
          f"(the rest is spelled out, no <UNK>)")

    per_token = np.array([len(encode_token(t, stoi)) for t in tokens], dtype=np.int64)
    ids = np.array(encode(text, stoi), dtype=np.int64)
    print(f"encoded stream: {len(ids):,} tokens | vocab size {len(vocab)} "
          f"| {len(ids) / len(tokens):.4f} ids per surface token (corpus mean)")
    return vocab, stoi, torch.from_numpy(ids), per_token


def get_batch(data, device, generator=None):
    ix = torch.randint(0, len(data) - BLOCK_SIZE - 1, (BATCH_SIZE,), generator=generator)
    x = torch.stack([data[i : i + BLOCK_SIZE] for i in ix])
    y = torch.stack([data[i + 1 : i + 1 + BLOCK_SIZE] for i in ix])
    return x.to(device), y.to(device)


@torch.no_grad()
def evaluate(model, data, device):
    """Mean loss over a FIXED set of validation batches (same seed every call),
    so successive numbers are comparable rather than sampling noise."""
    model.eval()
    gen = torch.Generator().manual_seed(4242)
    total = 0.0
    for _ in range(EVAL_BATCHES):
        x, y = get_batch(data, device, gen)
        _, loss = model(x, y)
        total += loss.item()
    model.train()
    return total / EVAL_BATCHES


def bigram_baseline(train_ids, val_ids, vocab_size, k=0.1):
    """Add-k bigram fitted on train, scored on val. The bar the transformer has
    to clear: if 4 layers and 64 tokens of context can't decisively beat "what
    usually follows the previous token", the model is not using its context and
    no amount of sampling tuning will make the output coherent."""
    counts = {}
    a = train_ids[:-1].tolist()
    b = train_ids[1:].tolist()
    for x, y in zip(a, b):
        row = counts.setdefault(x, {})
        row[y] = row.get(y, 0) + 1
    totals = {x: sum(r.values()) for x, r in counts.items()}
    nll = 0.0
    va = val_ids[:-1].tolist()
    vb = val_ids[1:].tolist()
    for x, y in zip(va, vb):
        row = counts.get(x)
        num = (row.get(y, 0) if row else 0) + k
        den = (totals.get(x, 0)) + k * vocab_size
        nll -= math.log(num / den)
    return nll / max(1, len(va))


def get_lr(step):
    """Linear warmup then cosine decay to MIN_LR."""
    if step < WARMUP_STEPS:
        return LEARNING_RATE * step / max(1, WARMUP_STEPS)
    r = min(1.0, (step - WARMUP_STEPS) / max(1, LR_DECAY_STEPS - WARMUP_STEPS))
    return MIN_LR + 0.5 * (LEARNING_RATE - MIN_LR) * (1 + math.cos(math.pi * r))


# ----------------------------------------------------------------------------
# Export
# ----------------------------------------------------------------------------
def export(model, vocab):
    """Write weights.bin (float16) and model_config.json with a tensor manifest."""
    model = model.to("cpu").eval()

    def W(linear):
        # nn.Linear weight is [out, in]; store as [in, out] (y = x @ W + b).
        return linear.weight.detach().t().contiguous()

    def b(linear):
        return linear.bias.detach().contiguous()

    named = []  # (name, tensor)
    named.append(("tok_emb", model.tok_emb.weight.detach()))      # [vocab, d_model]
    named.append(("pos_emb", model.pos_emb.weight.detach()))      # [block, d_model]
    for i, blk in enumerate(model.blocks):
        p = f"block.{i}"
        named.append((f"{p}.ln1.w", blk.ln1.weight.detach()))
        named.append((f"{p}.ln1.b", blk.ln1.bias.detach()))
        named.append((f"{p}.attn.W_Q", W(blk.attn.W_Q)))
        named.append((f"{p}.attn.b_Q", b(blk.attn.W_Q)))
        named.append((f"{p}.attn.W_K", W(blk.attn.W_K)))
        named.append((f"{p}.attn.b_K", b(blk.attn.W_K)))
        named.append((f"{p}.attn.W_V", W(blk.attn.W_V)))
        named.append((f"{p}.attn.b_V", b(blk.attn.W_V)))
        named.append((f"{p}.attn.W_O", W(blk.attn.W_O)))
        named.append((f"{p}.attn.b_O", b(blk.attn.W_O)))
        named.append((f"{p}.ln2.w", blk.ln2.weight.detach()))
        named.append((f"{p}.ln2.b", blk.ln2.bias.detach()))
        named.append((f"{p}.mlp.up.w", W(blk.mlp.up)))            # [d_model, d_ff]
        named.append((f"{p}.mlp.up.b", b(blk.mlp.up)))
        named.append((f"{p}.mlp.down.w", W(blk.mlp.down)))        # [d_ff, d_model]
        named.append((f"{p}.mlp.down.b", b(blk.mlp.down)))
    named.append(("ln_f.w", model.ln_f.weight.detach()))
    named.append(("ln_f.b", model.ln_f.bias.detach()))

    tensors = []
    offset = 0
    chunks = []
    for name, t in named:
        arr = t.numpy().astype(np.float16).ravel()  # row-major
        tensors.append(
            {
                "name": name,
                "shape": list(t.shape),
                "offset": offset,
                "length": int(arr.size),
            }
        )
        chunks.append(arr)
        offset += arr.size * 2  # 2 bytes per float16

    blob = np.concatenate(chunks)
    blob.astype("<f2").tofile(WEIGHTS_PATH)
    size = os.path.getsize(WEIGHTS_PATH)

    config = {
        "vocab_size": VOCAB_SIZE,
        "d_model": D_MODEL,
        "n_layers": N_LAYERS,
        "n_heads": N_HEADS,
        "head_dim": HEAD_DIM,
        "d_ff": D_FF,
        "block_size": BLOCK_SIZE,
        "dropout": DROPOUT,
        "tied_embeddings": True,
        "weight_layout": "y = x @ W + b, W is [in, out]; embeddings are [rows, d_model]",
        "dtype": "float16",
        "endianness": "little",
        "vocab": vocab,
        "tensors": tensors,
    }
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)

    n_params = sum(t["length"] for t in tensors)
    print(f"\nexported {len(tensors)} tensors, {n_params:,} params")
    print(f"weights.bin: {size:,} bytes ({size / 1024:.1f} KiB)")
    return size


# ----------------------------------------------------------------------------
# Train
# ----------------------------------------------------------------------------
def main():
    global VOCAB_SIZE
    torch.manual_seed(SEED)
    np.random.seed(SEED)

    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
    print(f"device: {device} | dropout {DROPOUT} | lr decay over {LR_DECAY_STEPS} steps")

    vocab, stoi, data, per_token = build_data()
    VOCAB_SIZE = len(vocab)

    # contiguous held-out tail (see VAL_FRACTION)
    n_val = int(len(data) * VAL_FRACTION)
    train_data, val_data = data[: len(data) - n_val], data[len(data) - n_val :]
    print(f"split: {len(train_data):,} train / {len(val_data):,} val tokens")
    # ids-per-surface-word ON THE VAL SLICE. Losses are per TOKEN, and a bigger
    # vocab means fewer, more informative tokens — so per-token perplexity rises
    # even when the model improves, and only a per-surface-word number can be
    # compared between vocab settings. It must be measured on the val slice, not
    # the corpus: the held-out tail is far more name-dense than average (1.31 vs
    # 1.19 ids/word at vocab 3598), and using the corpus mean here flips the
    # sign of a close comparison.
    cum = np.cumsum(per_token)
    n_val_words = int((cum > len(data) - n_val).sum())
    expansion = n_val / max(n_val_words, 1)
    print(f"val slice: {n_val_words:,} surface words, {expansion:.4f} ids/word")
    bigram_nll = bigram_baseline(train_data, val_data, VOCAB_SIZE)
    print(f"bigram baseline on val: {bigram_nll:.4f} nats (ppl {math.exp(bigram_nll):.1f})")
    model = TinyGPT().to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"model params: {n_params:,}")

    # Weight decay belongs on matmul weights only; decaying LayerNorm gains and
    # biases (and the tied embedding, which is also the output head) just drags
    # them toward zero for no regularisation benefit.
    decay, no_decay = [], []
    for name, prm in model.named_parameters():
        (no_decay if prm.ndim < 2 or "emb" in name else decay).append(prm)
    opt = torch.optim.AdamW(
        [
            {"params": decay, "weight_decay": WEIGHT_DECAY},
            {"params": no_decay, "weight_decay": 0.0},
        ],
        lr=LEARNING_RATE,
    )
    print(f"params: {sum(p.numel() for p in decay):,} decayed / "
          f"{sum(p.numel() for p in no_decay):,} not")

    t0 = time.time()
    recent = []
    best_val = float("inf")
    best_state = None
    best_step = 0
    no_improve = 0
    final_loss = None

    for step in range(1, MAX_STEPS + 1):
        lr = get_lr(step)
        for grp in opt.param_groups:
            grp["lr"] = lr
        x, y = get_batch(train_data, device)
        _, loss = model(x, y)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()

        recent.append(loss.item())
        final_loss = loss.item()

        # Early stopping now watches VALIDATION loss, with the best weights kept.
        # The old test watched a 100-step average of TRAINING loss and required a
        # 0.01 improvement to reset its counter — but late in training the gain
        # per 100 steps is far below 0.01, so it fired on noise not long after
        # MIN_STEPS and the run never reached its step budget.
        if step % EVAL_EVERY == 0:
            val = evaluate(model, val_data, device)
            smoothed = sum(recent[-EVAL_EVERY:]) / len(recent[-EVAL_EVERY:])
            flag = ""
            if val < best_val - 1e-3:
                best_val = val
                best_step = step
                best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
                no_improve = 0
                flag = "  *best"
            else:
                no_improve += 1
            print(f"step {step:6d} | train {smoothed:.4f} | val {val:.4f} "
                  f"(ppl {math.exp(val):6.1f}) | vs bigram {bigram_nll - val:+.3f} "
                  f"| lr {lr:.2e}{flag}")
            if step >= MIN_STEPS and no_improve >= PATIENCE:
                print(f"validation loss stopped improving at step {step}; "
                      f"stopping (best was step {best_step}).")
                break

    if best_state is not None:
        print(f"restoring best weights from step {best_step} (val {best_val:.4f})")
        model.load_state_dict(best_state)

    train_time = time.time() - t0
    print(f"\ntraining done: {step} steps in {train_time:.1f}s "
          f"({train_time / step * 1000:.1f} ms/step), final train loss {final_loss:.4f}")
    print(f"best val loss {best_val:.4f} (ppl {math.exp(best_val):.1f}) at step {best_step}")
    print(f"bigram baseline {bigram_nll:.4f} (ppl {math.exp(bigram_nll):.1f}) "
          f"-> model is {bigram_nll - best_val:+.3f} nats better "
          f"({(1 - math.exp(best_val) / math.exp(bigram_nll)) * 100:.0f}% lower perplexity)")
    print(f"per SURFACE WORD (the only figure comparable across vocab sizes): "
          f"{best_val * expansion:.4f} nats  [vocab {VOCAB_SIZE}, "
          f"{expansion:.4f} ids/word on val]")

    # ---- sanity-check generations ----
    prompt = "Thus saith the LORD "
    model.eval()
    pids = torch.tensor([encode(prompt, stoi)], dtype=torch.long, device=device)

    greedy = model.generate(pids, max_new_tokens=60, temperature=None)[0].tolist()
    sample = model.generate(pids, max_new_tokens=60, temperature=0.8)[0].tolist()

    print("\n--- greedy (temp=0) ---")
    print(detokenize([vocab[i] for i in greedy]))
    print("\n--- sampled (temp=0.8) ---")
    print(detokenize([vocab[i] for i in sample]))

    # ---- export ----
    size = export(model, vocab)

    print("\n========== SUMMARY ==========")
    print(f"training: {step} steps, {train_time:.1f}s, best val {best_val:.4f} "
          f"(ppl {math.exp(best_val):.1f}) vs bigram ppl {math.exp(bigram_nll):.1f}")
    print(f"weights.bin size: {size:,} bytes")


if __name__ == "__main__":
    main()
