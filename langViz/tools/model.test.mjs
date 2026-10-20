// Invariants for the real model's knockouts and per-position predictions.
//   node --test langViz/tools/model.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'fs/promises';
import {ROOT, loaded, tokenizer, makeWith} from './node-model.mjs';

const {makeGenerator} = await import('../js/generate.js');
const means = JSON.parse(await readFile(ROOT + 'ablation_means.json', 'utf8'));
const model = makeWith(means); // what the page runs: mean-ablation
const zeroModel = makeWith(null); // the fallback: zero-ablation
const tok = tokenizer;
const {n_layers: L, n_heads: H} = loaded.config;
const ids = tok.encode('And it came to pass, when the king heard');
const maxDiff = (a, b) =>
  a.reduce((m, x, i) => Math.max(m, Math.abs(x - b[i])), 0);

test('an empty knockout set is the intact model', () => {
  assert.equal(
    maxDiff(model.forward(ids).logits, model.forward(ids, new Set()).logits),
    0,
  );
});

test('a mean-ablated branch writes its corpus mean at every position', () => {
  const {activations} = model.forward(ids, new Set(['m1', 'a2']));
  const D = loaded.config.d_model;
  for (const [w, m] of [
    [activations.layers[1].mlp_write, means.mlp[1]],
    [activations.layers[2].attn_write, means.attn[2]],
  ]) {
    for (let t = 0; t < ids.length; t++)
      assert.ok(maxDiff(w.subarray(t * D, (t + 1) * D), m) < 1e-6);
  }
});

test('attribution still sums to the logit with knockouts on', () => {
  const {logits, activations} = model.forward(
    ids,
    new Set(['m1', 'a2', 'a0h3']),
  );
  const target = logits.indexOf(Math.max(...logits));
  const a = model.attribute(activations, target);
  assert.ok(Math.abs(a.verify - logits[target]) < 1e-3);
});

test('all heads mean-ablated equals the whole branch mean-ablated', () => {
  // W_O is linear, so W_O·mean(heads) + b_O = mean(attn write), up to the
  // 6-decimal rounding in the file
  const heads = new Set(Array.from({length: H}, (_, h) => `a0h${h}`));
  const a = model.forward(ids, heads).activations.layers[0].attn_write;
  const b = model.forward(ids, new Set(['a0'])).activations.layers[0]
    .attn_write;
  assert.ok(maxDiff(a, b) < 1e-3, `max diff ${maxDiff(a, b)}`);
});

test('zero-ablation fallback: every branch off leaves only the embedding', () => {
  const all = new Set();
  for (let l = 0; l < L; l++) all.add(`a${l}`).add(`m${l}`);
  const {activations} = zeroModel.forward(ids, all);
  const final = activations.lens[L],
    emb = activations.lens[0];
  assert.deepEqual(
    final.map((o) => o.id),
    emb.map((o) => o.id),
  );
  assert.ok(Math.abs(final[0].prob - emb[0].prob) < 1e-6);
});

test('per-position predictions match a forward pass on each prefix', () => {
  const preds = model.predictions(ids);
  assert.equal(preds.length, ids.length - 1);
  for (const t of [0, 3, ids.length - 2]) {
    const lg = model.forward(ids.slice(0, t + 1)).logits;
    let m = -Infinity;
    for (const x of lg) m = Math.max(m, x);
    let s = 0;
    for (const x of lg) s += Math.exp(x - m);
    assert.ok(Math.abs(preds[t].p - Math.exp(lg[ids[t + 1]] - m) / s) < 1e-5);
    assert.equal(preds[t].top[0].id, lg.indexOf(Math.max(...lg)));
  }
});

test('restep recomputes the same token under a new knockout set', () => {
  const gen = makeGenerator(model, tok);
  gen.reset('Thus saith the LORD');
  const opts = {temperature: 1, topk: 40, minp: 0.08};
  const first = gen.step(opts);
  const before = gen.ids.slice();
  const again = gen.restep({...opts, off: new Set(['m0'])});
  assert.deepEqual(gen.ids, before);
  assert.equal(again.tokenId, first.tokenId);
  assert.ok(again.intact && again.intact.top[0].id === first.topOutputs[0].id);
});

test('rewriting from a word truncates, forces the pick, and marks it chosen', () => {
  const gen = makeGenerator(model, tok);
  gen.reset('Thus saith the dog');
  const lord = tok.encode('LORD')[0];
  gen.truncate(3);
  const snap = gen.step({temperature: 1, topk: 40, force: lord});
  assert.equal(snap.tokenId, lord);
  assert.equal(gen.promptLength, 3);
  assert.equal(gen.length, 4);
  assert.ok(gen.records[3].chosen && gen.records[3].p > 0.1);
  assert.equal(gen.records[0], null);
});
