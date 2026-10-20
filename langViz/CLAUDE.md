# langViz notes

- Timing in the desktop app's built-in browser pane is meaningless while the pane is hidden (it runs as a background page: a knockout toggle measured 400ms there vs 37ms headless). Measure performance with Playwright.
- Knockout keys are shared by `model.forward(ids, off)`, the renderer's hit-testing and the URL: `a{b}` attention branch, `m{b}` MLP, `a{b}h{h}` one head. Mean-ablation from `ablation_means.json`; the branch still computes so the viz has activations. Re-run `npm run means` after any retrain (the page checks a fingerprint of `ln_f.w` and falls back to zero-ablation). Zero-ablation overstated every branch but block 0's MLP by 20-100% (README table), so don't switch back.
- `tools/node-model.mjs` loads the real model in Node; measuring knockouts over held-out text is slow (~4s per knockout per 40 windows), so keep sweeps small.
- `gen.restep()` recomputes the current step under a new knockout set by popping the last token and re-producing it with `force`, so toggling never resamples. `gen.records[i]` is what the model predicted at position i (null for the first token).
- On toggle, the network updates first and the whole-window re-score (`gen.rescore`, one extra forward + per-position unembedding) runs in a later task.
- The JS was never Prettier-formatted before the formatting-only commit; keep formatting changes in their own commits so feature diffs stay readable.
