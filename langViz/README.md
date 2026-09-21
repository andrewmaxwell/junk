Language Model Visualizer - 2026 - Watch the inner workings of a tiny GPT doing inference

# langViz

A tiny GPT (4 layers, d_model 96, 4 heads, ~8.1k-token vocab, ~1.2M params)
trained on the KJV bible, running **inference entirely in the browser** in vanilla
JS. The page is a near-chrome-free ambient piece: it auto-generates KJV-flavored text
one token at a time from a fixed prompt (looping every 96 generated tokens) and renders a
**pannable/zoomable visualization of the whole network lighting up as it infers.**
On-screen controls are a **prompt box** and transport at the top and a **stage
rail** along the bottom; the sampling constants are fixed in `js/main.js`.

The tokenizer is word-level with a **character fallback**: the ~8k most common
words/punctuation are whole tokens (99.3% of the corpus), and any rarer word is
spelled out as a first character plus `##`-continuation pieces. So every word is representable and there
is effectively no `<UNK>` — the model can even invent plausible proper nouns
letter by letter.

## The visualization

The network is laid out left-to-right around a horizontal **residual-stream
spine**. For each of the 4 blocks an **attention** branch arcs above the spine
(LN → Q/K/V → attn out → merge) and an **MLP** branch arcs below (LN → ↑proj →
GELU → ↓proj → merge), ending in a final LayerNorm and a top-25 output column.
Nodes are the activation values for the currently-predicting (last) token; each
generated token sends a left-to-right wave that lights up nodes and edges.

**The spine is one token's journey.** A key idea the layout makes literal: the
residual stream you follow is the _last_ token of the window, on its way to
becoming the next-token prediction. Every operation — LN, ↑proj, GELU, ↓proj —
acts on that one token alone. The **only** place the other tokens influence it is
attention, and the viz shows this directly: the other window tokens run as faint
parallel **ghost lanes** just below the spine, never touching it, except at each
block's attention where warm "value-pull" curves fan up from the lanes into the
attention output (brighter = more attended).

Above each block sits an **attention panel**: one heat strip per head showing
where the currently-predicting token's query attends back over the window
(brighter = more weight, the outlined cell is the token's own position). Zoom in
and each row is labeled by head, with the most-attended token spelled out.

Three overlays make the "what is it actually doing" legible at a glance:

- **Logit lens** — the model's running top-3 **guess for the next token**, read
  off the residual stream at each depth by applying the final LayerNorm + tied
  unembedding. You watch the guess go from a vague/common word at the raw
  embedding (which mostly just echoes the current token) to the real answer by
  the last block; a guess that already matches the **final** top-1 is drawn in
  gold. It is shown twice:
  - the **lens rail** (screen space, down the right edge) is the always-legible
    copy — five cells, embedding → after each block, lit in turn by the wave. The
    shallowest cell from which the top guess is the final answer and never
    changes again is flagged `matches onward`. This is retrospective top-1
    agreement, not evidence of causal commitment: later blocks can still change
    the scores substantially. Intermediate lens probabilities are probes, not
    calibrated confidence. It lives on the right because the per-stage camera
    framings are height-limited, so horizontal room is what's actually spare —
    and `fitRect` reserves its width so nothing is framed underneath it.
  - the in-world **chips** above the spine at each block boundary are the same
    data placed in the network, for when you've zoomed to a block. The last chip
    equals the output column.
- **Direct logit attribution** — the lens says *what* the model is guessing;
  this says *what made it guess that*. The residual stream is a plain sum of
  what each part wrote to it:

  `x = embedding + Σ_b (attn_write_b + mlp_write_b)`

  and the logit for a token is `LN_f(x) · e_v`. LayerNorm isn't linear, but
  holding its scale at the value the real forward pass produced makes it
  **affine**, and an affine map distributes over that sum. So each of the 9
  components gets an exact number of logits — not a heuristic "importance
  score", an actual decomposition that **sums back to the logit** (checkable:
  `__attribCheck()` in the console, or `node tools/shot.mjs attrib "…"`, prints
  the reconstruction error — it's ~1e-6, i.e. float32 rounding). It shows up in
  three places:
  - each branch's **blob is tinted** by how much it moved the produced token, so
    from the overview you can see which blocks directly contributed to the sampled token’s logit glowing warm;
  - a **bar + signed number** just outside each branch (right/orange = pushed
    toward the token, left/blue = pushed away);
  - a ranked **"logit contributions to X"** panel under the lens in the right rail.

  Attribution is computed for the token the model *actually produced* — the
  sampled one, which under min-p sampling is often not the lens's top-1. That's
  the more useful question ("why did it say that?"), and the panel names the
  token so the two readouts don't look like they disagree. Typical result for
  this model: the **MLPs dominate**. `"Thus saith the LORD"` → `"of"` (the
  argmax, which is what `__attribCheck` targets) decomposes as MLPs +2.26,
  +2.78, +2.90, +1.55 = **+9.50** against attention's +0.64, +0.26, +0.78,
  +1.11 = +2.79, with the raw embedding pushing *against* the answer at −0.68.
  Reconstruction error 2.45e-7.
- **Attention arcs** (on the text strip itself): the model's input window is the
  reading text, and the last input token sends **arcs back to the tokens it
  attended to while predicting the next token** — the intuitive "this word looked at those words" view. One arc
  per (head, target), colored by head, thickness/opacity ∝ weight. It shows the
  final layer's heads; the per-block heat panels cover the rest.

### Rendering: a DOM/canvas hybrid

The network's **nodes, weight edges, attention heat-strips and arcs** are drawn
on `<canvas>` (thousands of primitives, redrawn each frame). Everything that is
**text or a box** — the strip, the logit-lens chips, block titles, branch
watermarks, per-column names + glosses, input/output labels — lives in a DOM
layer (`#worldInner`) that is given the _exact same_ `translate+scale` transform
as the canvas, so it pans and zooms in lockstep while CSS handles the layout the
canvas can't (flow, wrapping, collision-free lanes). Attention arcs are drawn on
a small overlay canvas aligned to the strip's real word positions.

- **Stages.** The annotated network is ~6500 world units wide and ~1000 tall, so
  fitting all of it on a 16:9 screen pins the scale near 0.25 — width is what
  binds, and no amount of vertical tuning changes it. So fit-everything is only
  the *establishing shot*. The **stage rail** (bottom) and the **← / →** keys fly
  the camera between named stops in reading order along the spine — `input`,
  then `attention` / `MLP` per block, then `output` — each framed to fill the
  viewport at a readable scale (0.6–1.3 rather than 0.25). `Esc` or `0` returns
  to the overview. The framing accounts for the fixed text strip at the top and
  the rail at the bottom, so nothing important lands under them.
- **Drag** to pan, **scroll** to zoom toward the cursor, **double-click** to
  refit. Any manual pan/zoom drops out of stage mode (the rail de-highlights)
  until you pick a stage again.
- **Everything scales together:** all labels, glosses, the lens chips and the
  output list live in world space and zoom with the network — nothing is hidden
  or faded by zoom level. Zoomed out you see the whole thing small; zoom in to
  read any part. Each column carries a one-line plain-English gloss (e.g. `Q` →
  "query", `↑ proj` → "96→384"), and each branch quietly adds its output back
  into the spine (the residual connection).
- **Zoom-in explainer plates:** small paragraphs you can zoom into that describe
  each kind of op and why it matters — LayerNorm, Q/K/V, ↑proj, GELU, the
  residual stream, the input, the final norm, and a "why 4 blocks?" note. To stay
  uncluttered they annotate only **block 0** (all four blocks are structurally
  identical) plus the shared input/stream/output.
- **Neuron inspector (hover):** hover any of the 384-wide ↑proj/GELU units and a
  tooltip shows what that neuron **fires most on** — its top max-activating tokens
  over the whole corpus, plus an example context — with the matching unit ringed
  in both the ↑proj and GELU columns. This is the honest answer to "do the nodes
  mean anything": some are clean (a unit that fires on `saith`, or on names after
  "son of"), many are polysemantic. Labels come from `neuron_labels.py` (offline);
  if `neuron_labels.json` is absent the feature simply turns off.
- **Encoding** (see the on-canvas legend, bottom-left): edge color = weight sign
  (blue +, red −), opacity ∝ |weight|, brightening along the live data path; node
  color is a diverging blue→dark→orange scale by activation value; each attention
  head has its own hue.
- **Text strip** (top): the model's actual input **window** — what it can
  currently see — with **prompt** tokens in gold, and the just-produced token
  appended and highlighted (it matches the lit token in the output column). As
  generation runs past the window size the prompt scrolls out of view, which is
  itself honest: the model can no longer see it. The spine's left end is marked
  `input ▸`, the right end `output`. A continuation word-piece shows glued to its
  predecessor; `◌` would be `<UNK>` but effectively never appears.

### Motion

Three things carry the sense that a computation is happening rather than a
diagram being redrawn:

- **The wave is a comet, not a blob.** The per-step sweep modulates edge glow by
  distance from a moving front. A symmetric Gaussian lights the path *ahead* of
  the front exactly as much as behind it, which reads as a blob sliding across.
  The kernel is asymmetric instead — `exp(-2.4d²)` ahead, `exp(-0.52d)` behind —
  so one column ahead of the front is at 9% brightness and three columns behind
  is still at 21%, and the eye reads energy flowing left to right. The front also
  keeps travelling for 45% of a wave duration past the right edge, so the tail
  decays off-screen rather than the network snapping dark between steps.
- **Value-pull particles.** Dots ride the ghost→attention curves. The curve says
  "these tokens are connected here"; the particles say information is *moving*
  along it, which is the one moment in the forward pass where one token's
  content reaches another. Brightness and size scale with how much this token
  actually attends to that lane, so only the strong lanes visibly carry flow.
- **Output bloom.** Additive radial gradients under the output column
  (`globalCompositeOperation = 'lighter'`, no offscreen blur pass or
  `ctx.filter`), swelling as the wave arrives — so the answer lights up when the
  computation actually reaches it, and the eye lands on the one thing that is
  the point.

**Edges come in two layers**, because one layer cannot do both jobs. The
*structure* layer is precomputed once into per-sign, per-|weight|-bucket
`Path2D`s (~16 stroke calls per matrix) and drawn dim: its alpha can only be
modulated per matrix, since per-edge alpha across every weight would be hundreds
of thousands of stroke calls a frame — so on its own it reads as texture that
pulses, not as information. The *signal* layer on top is true per-edge: for each
matrix, the few most-activated destination units and the few sources
contributing most to each, ranked by **activation x weight** rather than
|weight| (a large weight fed by a dead unit moves nothing, and this product is
what actually lands in the destination). That set is recomputed once per
generated token, so the per-frame cost is a few hundred short lines — the change
also roughly doubled the frame rate, since the dim wash now draws half as many
buckets. The legend calls the two layers out.

## Run it

ES modules require HTTP (they will **not** load over `file://`). From this
directory:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Generation starts on load and loops on its own.

- **Type in the prompt box** and press `↵` to generate from your own text.
  Focusing the box pauses generation, so the strip you are reading stops being
  overwritten mid-thought; `↵` commits and resumes, `Esc` discards and resumes.
  The counter shows how many tokens your text encodes — a quick way to see the
  tokenizer at work, since a rare word costs one token per letter. The counter also identifies unsupported characters and prompts longer than
  the 64-token context. The fallback covers English letters, not arbitrary Unicode.
- **`space`** stops and restarts generation, **`.`** generates exactly one more
  token (and stops the clock if it was running). Everything else in the piece —
  the lens rail, the attribution panel, the neuron inspector — is worth reading
  for longer than one tick, so being able to stop the clock is what makes the
  rest of it usable. The `pause`/`step` buttons do the same thing.
- **← / →** (or the stage rail) walks the network stage by stage; `Esc` or `0`
  returns to the overview.

  Being stopped for editing and being stopped on purpose are tracked
  separately, so blurring the prompt box never resumes a generation you paused
  deliberately.

Temperature (1.0), min-p (0.08), the repetition penalty (0.6) and pacing are
constants at the top of
`js/main.js`. `window.__setPrompt(text)` does the same thing from the console.

There are also npm scripts (run from the repo root) for development:

```bash
npm run langviz:serve    # static server on :8765
npm run langviz:train    # retrain + re-export weights.bin / model_config.json
npm run langviz:parity -- "Thus saith the LORD"           # python reference logits
npm run langviz:labels                                    # rebuild neuron_labels.json (REQUIRED after any retrain)
node langViz/tools/shot.mjs /tmp/x.png 6000               # headless screenshot
node langViz/tools/shot.mjs /tmp/x.png 6000 stage:2      # ... framing a named stage
node langViz/tools/shot.mjs parity "Thus saith the LORD"  # browser-side logits
node langViz/tools/shot.mjs attrib "Thus saith the LORD"  # attribution + reconstruction error
```

Sweeps write beside the shipped artifacts unless redirected:

```bash
OUT_DIR=/tmp/sweep OUT_TAG=6layer N_LAYERS=6 python3 -u train.py
EXTRA_CORPUS="moby-dick.txt,alice-in-wonderland.txt" EXTRA_WEIGHT=0.25 python3 -u train.py
```

Each run ends with a one-line `RESULT {...}` JSON record (tag, hyperparams,
best val, nats/word) for collecting a table across runs.

## Files

```
index.html        markup + styles: canvas + #world DOM layer + #io text strip/arcs
js/weights.js     fetch weights.bin, decode float16 -> Float32Array per tensor
js/tokenizer.js   word/punct tokenizer + char fallback (matches train.py exactly)
js/model.js       full forward pass: matmul, LayerNorm, GELU, causal MHA, tied head, logit lens, attribution
js/generate.js    autoregressive loop, sliding 64-token window, temperature/top-k
js/renderer.js    the visualization: canvas net + DOM world-layer (labels, lens chips, output, attn), pan/zoom, arcs
js/main.js        generation loop + builds the text strip + window.__viz / __parityCheck
tools/shot.mjs    self-contained headless screenshot / parity / perf harness
parity.py         Python/numpy reference forward pass (see below)
train.py          trains the model and exports the weights (npm run langviz:train)
neuron_labels.py  offline pass: label each MLP neuron by its top activators
neuron_labels.json  per-neuron triggers/contexts for the hover inspector (generated)
weights.bin       float16 params, model_config.json = hyperparams + vocab + manifest
```

## Training

`npm run langviz:train` (or `python3 train.py`). Requires `torch` + `numpy`.
Environment overrides: `MAX_STEPS`, `N_WORDS`, `N_LAYERS`, `DROPOUT`,
`LR_DECAY_STEPS`, `DECAY_EMB`, `EXTRA_CORPUS`, `EXTRA_WEIGHT`, and
`OUT_TAG`/`OUT_DIR` (which redirect the exported artifacts so a sweep cannot
clobber the `weights.bin` the page loads).

> **`LR_DECAY_STEPS` used to default to 16000, which did not reproduce this
> model.** The sweep below picked decay over 40000 (val ppl 68.6), but a default
> `python3 train.py` ran 16000 and landed on ppl 81.3 — the third row, not the
> last one. The default is now 40000 and a fresh run reproduces the shipped
> `weights.bin` to a mean absolute difference of 1e-6.

The corpus is ~890k surface tokens of KJV → ~1.06M ids after the character
fallback. The last **5%** is held out as one *contiguous* block (not random
windows, so no validation context can appear inside a training window), and
training early-stops on validation loss with the best weights restored.

Every eval prints the model against an **add-0.1 bigram fitted on the training
split** — the bar that matters. A 4-layer transformer with 64 tokens of context
that can't decisively beat "what usually follows the previous token" is not
using its context, and no amount of sampling tuning will make its output
coherent. Current run:

```
bigram baseline on val : 5.2950 nats (ppl 199.3)
best val               : 4.2281 nats (ppl  68.6) at step 26750
                         -> +1.067 nats, 66% lower perplexity
```

`DROPOUT` (default 0.1) and `LR_DECAY_STEPS` (default 40000, separate from the
`MAX_STEPS` cap) are the two knobs that got it there. Both came out of a sweep,
and only one of them for the reason expected:

| dropout | LR decay | val ppl | nats/word |
|--------:|---------:|--------:|----------:|
|     0.0 |      30k |    89.7 |    4.9499 |
|     0.0 |      16k |    91.1 |    4.9674 |
|     0.1 |      16k |    81.3 |    4.8413 |
|     0.2 |      16k |    89.9 |    4.9522 |
| **0.1** | **40k**  | **68.6**| **4.6544**|

Dropout was a config field the model never implemented; adding it is worth ~9%
perplexity at 0.1 and nothing at 0.2. **Annealing the LR sooner did not help on
its own** (row 2 is slightly worse than row 1) — the plausible story that the
old runs "never reached the low-LR phase" is not what was holding them back.
What mattered was dropout *plus* enough steps to use it: at `LR_DECAY_STEPS=16k`
the 0.1 run was still improving when it hit the 30k cap.

`MAX_STEPS` now defaults to 50000 rather than 30000. On the KJV-only config this
changes nothing — early stopping fires on patience around step 28750, well under
either cap — but with `EXTRA_CORPUS` set the run is still improving at step
36000, so the old cap would have truncated it.

**Comparing runs with different `N_WORDS` is a trap.** Loss is per *token*, and a
bigger vocab means fewer, more informative tokens — so per-token perplexity rises
even when the model improves. Only nats per *surface word* can be compared, and
the conversion factor has to be measured on the **val slice**, not the corpus:
the held-out tail is far more name-dense than average (1.31 vs 1.19 ids/word at
vocab 3598), and using the corpus mean flips the sign of a close comparison.
Scoring both checkpoints on identical held-out text, word for word:

| vocab | nats / surface word | non-words generated |
|------:|--------------------:|--------------------:|
|  3598 |              4.9524 |                1.1% |
|  8097 |          **4.9056** |            **0.0%** |

> An earlier version of this file used `N_WORDS = 3500` and trained with no
> validation split at all, and
> early-stopped on a 100-step average of *training* loss that required a 0.01
> improvement to reset its patience counter. Late in training the gain per 100
> steps is far below 0.01, so it fired on noise shortly after `MIN_STEPS` and the
> run ended around step ~3.5k. Validation loss was still improving at step 12k.

### What doesn't work (measured, so you don't retry it)

Four follow-up experiments, all against `A_base` as the control — the fixed
defaults above, which reproduce the shipped weights. Generation columns are at
matched decoding (`min-p 0.08` + `rep 0.6`), 5 prompts x 6 seeds x 96 tokens.

| run | change | val ppl | nats/word | wellformed3 | copied4 |
|---|---|---:|---:|---:|---:|
| `A_base` | control | 68.6 | 4.6544 | 86.0% | 55.1% |
| `B_embdecay` | `DECAY_EMB=1` | 67.9 | 4.6436 | 85.3% | 55.0% |
| `C_6layer` | `N_LAYERS=6`, +18% params | 67.2 | 4.6314 | 84.9% | 55.3% |
| `E_data25` | +660k words of prose, 25% of batches | 67.4 | 4.6358 | 85.0% | 55.0% |
| `F_data50` | same, 50% of batches | 72.1 | 4.7101 | 85.2% | 54.7% |

Not one improves generation. The best of them moves perplexity 2% (inside
single-seed noise; every run here used `SEED=1337`) and the worst is 5% behind
the control. For scale, the dropout + LR-decay sweep above moved ppl
89.7 -> 68.6.

**Weight decay on the tied embedding (`DECAY_EMB`).** The premise was that 53%
of the 8097 vocab rows are tokens seen fewer than 10 times, they hold 34% of the
model's parameters, and — because embeddings are tied — each is a live output
direction competing in every softmax. Decay was supposed to shrink the starved
rows relative to the trained ones. It doesn't. Measured row norms by token
frequency, B vs A:

| token freq | rows | \|e\| A | \|e\| B | B/A |
|---|---:|---:|---:|---:|
| <10x (rare) | 4331 | 9.722 | 8.672 | 0.892 |
| 10-99x | 2969 | 9.567 | 8.528 | 0.891 |
| 100-999x | 670 | 9.564 | 8.524 | 0.891 |
| 1000x+ | 127 | 9.613 | 8.578 | 0.892 |

Identical shrinkage in every band. AdamW's decoupled decay applies uniformly
each step whether or not a row got a gradient, so on a tied model it is
**approximately a global logit temperature change, not a regulariser that
discriminates undertrained rows**. The flag is kept (default off) only because
this table is easier to trust than to re-derive.

The premise was wrong anyway: those rare rows supply **0.1% of generated
tokens** (3 of 2880). They are not injecting noise — they are simply *inert*.
A third of the model does nothing for the output you actually see, which is an
allocation problem, not a grammar one.

**Depth (`N_LAYERS=6`).** +18% params, +50% training time, 2% better
perplexity, slightly *worse* generation. The renderer handles it correctly with
no changes (six blocks, six lens cells, the stage rail and attribution panel
both extend automatically) — so if you want six blocks for the *visual*, the
cost is 2.46MB -> 2.91MB of `weights.bin` and nothing else. Just don't expect
better text.

**More data (`EXTRA_CORPUS`).** The most promising hypothesis on paper: at
~890k words the default run sees the KJV ~116 times and copies 55% of its
4-grams verbatim. But sampling other prose for 25% of batches still leaves the
KJV seen ~87 times, and `copied4` did not move. Reducing memorisation needs
**fewer KJV epochs**, not a side dish — and the extra prose is 16-19% OOV under
a KJV vocabulary, so it inflates to ~2.0 ids/word against the KJV's 1.05 and
over half of what it adds is character-fallback spelling rather than grammar.

The dose-response settles it: **68.6 → 67.4 → 72.1** val ppl at 0% / 25% / 50%.
A quarter is noise, a half is a real loss — the validation slice is KJV, so past
some point dilution just costs register fit. Generation barely moves at either
(85.0% and 85.2% well-formed against the control's 86.0%). The one genuine
effect is on **repetition**, which falls monotonically with more data
(2.9% → 1.0% → 0.5% `rep4`) — but the repetition penalty already buys that for
free, without a retrain.

The `EXTRA_CORPUS` path is kept because it is correctly built (vocabulary from
the KJV alone, validation slice and bigram baseline untouched, so val loss stays
comparable across runs) and because a *larger corpus in the same register* is
still the one untested lever with a real mechanism behind it. Mixed-register
prose is not that lever.

The one thing that did survive: **the 6-layer model's logit lens has a longer,
more legible climb**, and `neuron_labels.json` is now rejected with a console
warning when its `n_layers`/`d_ff` disagree with the model — previously a labels
file with too few layers made the hover inspector report the extra blocks as
"this unit rarely fires" rather than admitting it had no data.

### Sampling

`TEMPERATURE = 1.0`, `MIN_P = 0.08`, `REP_PENALTY = 0.6` in `js/main.js`
(`MIN_P = 0` falls back to `TOP_K`). The strip caption is generated from these
constants rather than written out in `index.html`, so it cannot go stale.

**Min-p** keeps every token within `MIN_P` x the top token's probability. Unlike
top-k the cut is data-dependent — one candidate where the model is certain,
hundreds where it isn't — which is both better output and a more honest thing to
show. `step()` returns that count as `candidates`.

The **repetition penalty** subtracts a flat logit from whole words used in the
last `REP_WINDOW` tokens. It deliberately **exempts character-fallback pieces**:
spelling `Melchizedek` has to reuse letters, and penalising them would push the
model off rare names one letter at a time. It still costs something — the
fallback rate rises from 3.6% to 4.7% of tokens, because a penalised whole word
is sometimes replaced by a spelled-out rare one.

Worth knowing before you try to "fix" the output by turning the temperature
down: **it makes things worse in a non-obvious way.** Low temperature falls into
the genealogy attractor (`the son of X the son of Y`), the most memorized text
in the corpus and the most dense in rare proper nouns — and every rare name has
to be spelled out letter by letter. Measured on the older model, spelled-out
letters went from 3.6% of generated tokens at `T=0.8` to **32%** at `T=0.6`.

#### Why these numbers, and the ceiling behind them

Decoding was tuned against two measured quantities, 5 prompts x 8 seeds x 96
tokens per config, scored on the corpus itself:

- `wellformed3` — share of generated surface 3-grams that occur **verbatim in
  the KJV**. A 3-gram that appears in the corpus is by construction well-formed
  in this register, so this is a usable proxy for "grammatical".
- `copied4` — share of generated 4-grams copied verbatim. How much of that
  well-formedness is **recall rather than composition**.

The second number is what makes the first interpretable, and across a 20-point
grid of `MIN_P` x `REP_PENALTY` the two are correlated at **r = 0.975**: every
+1pt of verbatim copying buys +0.51pt of "grammaticality".

**That is the real finding. For a model this size, "more grammatical" and "more
plagiarised" are the same axis.** Decoding slides you along the line; it cannot
move the line. Tightening min-p to 0.15 reaches 91.8% well-formed — by reciting
67.3% of its 4-grams straight from the corpus. The shipped setting is picked to
raise grammar *without* raising copying, which is the only honest kind of win
available:

| decoding | wellformed3 | copied4 | rep4 | letters |
|---|---:|---:|---:|---:|
| `topk40 T0.8` (old default) | 84.6% | 55.2% | 2.9% | 3.6% |
| **`min-p 0.08` + `rep 0.6`** | **85.7%** | **54.7%** | **1.3%** | 4.7% |
| `min-p 0.15`, no penalty | 91.8% | 67.3% | 7.4% | 3.5% |

So: grammar up ~1pt, copying flat, and self-repetition **cut to under half**.
The repetition drop is the part you actually see on screen.

## Parity check (JS vs Python)

`weights.bin` is the shared source of truth. `parity.py` reloads those exact
float16 weights and runs the **same math** the browser runs (pre-norm
transformer, tied embeddings, **tanh-approx GELU**, LayerNorm eps `1e-5`), so the
two next-token distributions must agree within float16 tolerance.

**Python side:**

```bash
python3 parity.py "Thus saith the LORD"
```

**Browser side** (page served over HTTP, open the dev console):

```js
__parityCheck("Thus saith the LORD");
```

Both print the input token ids and the top-10 `(index, token, logit)`. They match
to ~5 decimal places, e.g. for `"Thus saith the LORD"` (ids `[235, 96, 2, 24]`):

```
   4  'of'           15.58495
  11  ';'            15.00569
   1  ','            14.82339
  34  'God'          12.61220
  14  'unto'         12.53661
   ...
```

> Both `weights.bin` and `neuron_labels.json` are **generated artifacts tied to a
> particular training run**. Re-run `neuron_labels.py` after every retrain: the
> JSON is keyed only by layer/unit index, so a stale one still loads and the
> hover inspector then reports confident, wrong features. (After the last
> retrain, 1,536 of 1,536 neurons had different top activators.) The parity
> numbers above are run-specific too.

> Note: `train.py` trains with PyTorch's exact (erf) GELU; both the browser and
> `parity.py` use the tanh approximation at inference. The difference is far below
> float16 tolerance and does not affect output quality — `parity.py` is the
> apples-to-apples reference for the JS forward pass.

## Interpretation and behavior notes

- Attention arcs originate at the underlined **last input token**, whose query
  produced the displayed attention. The highlighted token is its sampled output
  and has not yet passed through the model in this snapshot. Self-attention is
  shown in the heat strips; the text arcs omit self-links — and are scaled
  against the strongest *drawn* target, since a final-layer head often puts most
  of its mass on the self-link. A head whose attention is mostly self-directed is
  faded as a whole, so a big arc still means a big share of what went elsewhere.
  Each arc ends in a dot on its target: once the strip wraps, an arc reaches a
  token on an earlier line from below, and the dot is what ties it to a word.
- The output column shows the model distribution at temperature 1; generation
  samples at temperature 1.0 with min-p 0.08 and a 0.6 repetition penalty, so
  the sampled token can rank below the displayed rows. If it ranks below 25,
  it replaces the last displayed row and is labeled with its actual rank.
- Attribution is an additive decomposition of a logit with the observed final
  normalization scale fixed. It is not the causal effect of removing a component,
  and positive logit terms do not alone establish increased probability.
- The loop counts generated tokens independently of prompt length. Long prompts
  use their last 64 tokens, including on the initial display.
- Enter commits a prompt and resumes generation; Escape discards edits and
  preserves an intentional pause. Space on a focused button activates that button.

- The strip **wraps** rather than shrinking to one line, so a full 64-token
  window stays readable and the sampled token is never pushed off the end; arcs
  re-measure against the wrapped positions.
- The prompt box and transport are disabled until the model has loaded, so an
  edit typed during startup can't be overwritten by initialization.

Regression checks: `node --test tools/generate.test.mjs` — covers the sliding
window and rank-25 display, plus min-p's data-dependent cut, that the repetition
penalty never alters the *displayed* temperature-1 distribution, and that it
exempts character-fallback pieces.
