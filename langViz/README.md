Language Model Visualizer - 2026 - Watch the inner workings of a tiny GPT doing inference

# langViz

A tiny GPT (4 layers, d_model 96, 4 heads, ~3.6k-token vocab, ~0.8M params)
trained on the KJV bible, running **inference entirely in the browser** in vanilla
JS. The page is a chrome-free ambient piece: it auto-generates KJV-flavored text
one token at a time from a fixed prompt (looping every ~96 tokens) and renders a
**pannable/zoomable visualization of the whole network lighting up as it infers.**
There are no on-screen controls — prompt, temperature and top-k are fixed
constants in `js/main.js`.

The tokenizer is word-level with a **character fallback**: the ~3.5k most common
words/punctuation are whole tokens, and any rarer word is spelled out as a first
character plus `##`-continuation pieces. So every word is representable and there
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

Two overlays make the "what is it actually doing" legible at a glance:

- **Logit lens** (a chip above the spine at each block boundary): the model's
  running top-3 **guess for the next token**, read off the residual stream at
  that depth by applying the final LayerNorm + tied unembedding. You watch the
  guess go from a vague/common word at the raw embedding (which mostly just
  echoes the current token) to the real answer by the last block; a guess that
  already matches the **final** top-1 is drawn in gold — the depth at which the
  decision locks in. The last chip equals the output column.
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

- **Drag** to pan, **scroll** to zoom toward the cursor, **double-click** to
  refit.
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
  `▸ input`, the right end `output`. A continuation word-piece shows glued to its
  predecessor; `◌` would be `<UNK>` but effectively never appears.

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

Generation starts on load and loops; there is nothing to click. To change the
prompt, temperature (0.8), top-k (40), or pacing, edit the constants at the top of
`js/main.js`.

There are also npm scripts (run from the repo root) for development:

```bash
npm run langviz:serve    # static server on :8765
npm run langviz:train    # retrain + re-export weights.bin / model_config.json
npm run langviz:parity -- "Thus saith the LORD"           # python reference logits
npm run langviz:labels                                    # rebuild neuron_labels.json
node langViz/tools/shot.mjs /tmp/x.png 6000               # headless screenshot
node langViz/tools/shot.mjs parity "Thus saith the LORD"  # browser-side logits
```

## Files

```
index.html        markup + styles: canvas + #world DOM layer + #io text strip/arcs
js/weights.js     fetch weights.bin, decode float16 -> Float32Array per tensor
js/tokenizer.js   word/punct tokenizer + char fallback (matches train.py exactly)
js/model.js       full forward pass: matmul, LayerNorm, GELU, causal MHA, tied head, logit lens
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
   1  ','       13.32218
   4  'of'      12.80332
  11  ';'       11.66671
   5  '.'       10.86674
  73  'your'    10.76831
   ...
```

> Note: `train.py` trains with PyTorch's exact (erf) GELU; both the browser and
> `parity.py` use the tanh approximation at inference. The difference is far below
> float16 tolerance and does not affect output quality — `parity.py` is the
> apples-to-apples reference for the JS forward pass.
