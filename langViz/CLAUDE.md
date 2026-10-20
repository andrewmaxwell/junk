# langViz notes

- Timing in the desktop app's built-in browser pane is meaningless while the pane is hidden (it runs as a background page: a knockout toggle measured 400ms there vs 37ms headless). Measure performance with Playwright.
- Knockout keys are shared by `model.forward(ids, off)`, the renderer's hit-testing and the URL: `a{b}` attention branch, `m{b}` MLP, `a{b}h{h}` one head. Zero-ablation; the branch still computes so the viz has activations.
- `gen.restep()` recomputes the current step under a new knockout set by popping the last token and re-producing it with `force`, so toggling never resamples. `gen.records[i]` is what the model predicted at position i (null for the first token).
- On toggle, the network updates first and the whole-window re-score (`gen.rescore`, one extra forward + per-position unembedding) runs in a later task.
- The JS was never Prettier-formatted before the formatting-only commit; keep formatting changes in their own commits so feature diffs stay readable.
