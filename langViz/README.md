Language Model Visualizer - 2026 - Watch the inner workings of a tiny GPT doing inference

# langViz

A tiny GPT (4 layers, d_model 96, 4 heads, ~8.1k-token vocab, ~1.2M params)
trained on the KJV bible, running **inference entirely in the browser** in vanilla
JS. The page is a near-chrome-free ambient piece: it auto-generates KJV-flavored text
one token at a time from a fixed prompt (looping every ~96 tokens) and renders a
**pannable/zoomable visualization of the whole network lighting up as it infers.**
The only on-screen control is a **stage rail** along the bottom; prompt,
temperature and top-k are fixed constants in `js/main.js`.

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
    changes again is flagged `locked in`, and the footer names it (`decided by
    block 1`). Note *never changes again*, not *first matches*: the lens often
    hits the right token early, wanders off, and comes back, and only the start
    of the unbroken run means the model has committed. That number is the story —
    function words commit at the embedding, content words often not until the
    last block. It lives on the right because the per-stage camera
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
    from the overview you can see which blocks decided the answer glowing warm;
  - a **bar + signed number** just outside each branch (right/orange = pushed
    toward the token, left/blue = pushed away);
  - a ranked **"why it said X"** panel under the lens in the right rail.

  Attribution is computed for the token the model *actually produced* — the
  sampled one, which at temperature 0.8 is often not the lens's top-1. That's
  the more useful question ("why did it say that?"), and the panel names the
  token so the two readouts don't look like they disagree. Typical result for
  this model: the **MLPs dominate** and the late blocks do the deciding —
  `"Thus saith the LORD"` → `","` decomposes as block 3's MLP +6.78, block 1's
  MLP +2.54, and block 0's attention actually pushing *against* at −0.12.
- **Attention arcs** (on the text strip itself): the model's input window is the
  reading text, and the just-produced token sends **arcs back to the tokens it
  attended to** — the intuitive "this word looked at those words" view. One arc
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

Edge geometry is precomputed once into per-sign, per-|weight|-bucket `Path2D`s
(~32 stroke calls per matrix); only color/opacity changes per step. Live edge
glow is modulated per matrix (not per individual edge) for performance — the
nodes carry the true per-scalar activation colors.

## Run it

ES modules require HTTP (they will **not** load over `file://`). From this
directory:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Generation starts on load and loops on its own. Use **← / →** (or the stage rail
at the bottom) to walk the network stage by stage; `Esc` returns to the overview.
To change the prompt, temperature (0.8), top-k (40), or pacing, edit the constants
at the top of `js/main.js`.

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
`MAX_STEPS` and `N_WORDS` are environment overrides.

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
best val               : 4.4966 nats (ppl  89.7) at step 13500
                         -> +0.798 nats, 55% lower perplexity
```

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

### Sampling

`TEMPERATURE = 0.8`, `TOP_K = 40` in `js/main.js`. These were compared against
top-p, lower temperatures and a repetition penalty, and won. Worth knowing
before you try to "fix" the output by turning the temperature down: **it makes
things worse in a non-obvious way.** Low temperature falls into the genealogy
attractor (`the son of X the son of Y`), which is the most memorized text in the
corpus and the most dense in rare proper nouns — and every rare name has to be
spelled out letter by letter. Measured on the older model, spelled-out letters
went from 3.6% of generated tokens at `T=0.8` to **32%** at `T=0.6`.

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
   1  ','            16.03879
   4  'of'           15.53561
  11  ';'            14.62724
 414  'concerning'   13.87159
  34  'God'          13.78929
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
