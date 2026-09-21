import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGenerator } from '../js/generate.js';
const tokenizer = { encode: s => s.trim() ? s.trim().split(/\s+/).map(Number) : [], idToToken: String };
function setup(logits = new Float32Array(40)) {
  const windows = [];
  const model = { config: { block_size: 64 }, forward(ids) {
    windows.push(ids);
    return { logits, activations: {}, attention: [] };
  }, attribute: () => ({}) };
  return {gen: makeGenerator(model, tokenizer), windows};
}
test('long prompts use the last 64 tokens and count generated tokens separately', () => {
  const {gen, windows} = setup();
  gen.reset(Array.from({length: 100}, (_,i) => i).join(' '));
  assert.equal(gen.generatedCount, 0);
  for (let i = 0; i < 96; i++) gen.step({temperature: 0, topk: 40});
  assert.equal(gen.generatedCount, 96);
  assert.deepEqual(windows[0], Array.from({length: 64}, (_,i) => i + 36));
  assert.ok(windows.every(w => w.length === 64));
  gen.reset('1 2');
  assert.equal(gen.generatedCount, 0);
});
test('a sampled token below rank 25 remains visible with its actual rank and probability', () => {
  const oldRandom = Math.random;
  Math.random = () => 0.999999;
  try {
    const {gen} = setup(Float32Array.from({length: 40}, (_, i) => -i / 100));
    gen.reset('1');
    const snap = gen.step({temperature: 0.8, topk: 40});
    assert.equal(snap.tokenId, 39);
    assert.equal(snap.topOutputs.length, 25);
    const row = snap.topOutputs.find(o => o.sampled);
    assert.equal(row.rank, 40);
    assert.equal(row.id, snap.tokenId);
    assert.ok(row.prob > 0 && row.prob < snap.topOutputs[0].prob);
    assert.equal(snap.topOutputs[23].rank, 24);
  } finally { Math.random = oldRandom; }
});
test('empty prompt still gives inference a nonempty window', () => {
  const {gen, windows} = setup();
  gen.reset(''); gen.step({temperature: 0, topk: 40});
  assert.deepEqual(windows[0], [0]);
  assert.equal(gen.generatedCount, 1);
});

// --- min-p / frequency penalty -------------------------------------------

// ids map to multi-character "words" so nothing is mistaken for a
// character-fallback piece (which the penalty deliberately exempts).
const wordTokenizer = {
  encode: s => s.trim() ? s.trim().split(/\s+/).map(Number) : [],
  idToToken: id => `w${id}`,
};
function setupWords(logits) {
  const model = { config: { block_size: 64 }, forward: () => ({ logits, activations: {}, attention: [] }), attribute: () => ({}) };
  return makeGenerator(model, wordTokenizer);
}

test('min-p cuts a data-dependent candidate set, unlike a fixed top-k', () => {
  // one dominant token: everything else falls under 0.1 x the max
  const peaked = Float32Array.from({length: 40}, (_, i) => (i === 0 ? 20 : 0));
  const sure = setupWords(peaked);
  sure.reset('1');
  assert.equal(sure.step({temperature: 1, topk: 40, minp: 0.1}).candidates, 1);

  // a flat distribution: every token is within 0.1 x the max, so none are cut
  const flat = new Float32Array(40);
  const unsure = setupWords(flat);
  unsure.reset('1');
  assert.equal(unsure.step({temperature: 1, topk: 40, minp: 0.1}).candidates, 40);

  // top-k cannot tell those two steps apart
  const k = setupWords(peaked);
  k.reset('1');
  assert.equal(k.step({temperature: 1, topk: 40}).candidates, 40);
});

test('the frequency penalty steers sampling without altering the displayed distribution', () => {
  const logits = Float32Array.from({length: 40}, (_, i) => (i === 7 ? 10 : 0));
  const oldRandom = Math.random;
  Math.random = () => 0; // always take the highest-probability candidate
  try {
    const plain = setupWords(logits);
    plain.reset('7');                       // token 7 is already in the window
    const a = plain.step({temperature: 1, topk: 40});
    assert.equal(a.tokenId, 7);             // unpenalised: the peak wins

    const penalised = setupWords(logits);
    penalised.reset('7');
    const b = penalised.step({temperature: 1, topk: 40, repPenalty: 20});
    assert.notEqual(b.tokenId, 7);          // penalised below the flat field

    // the output column still shows the model's real temperature-1 beliefs
    const peak = b.topOutputs.find(o => o.id === 7);
    assert.ok(peak.prob > 0.99, `expected the true distribution untouched, got ${peak.prob}`);
    assert.equal(peak.rank, 1);
  } finally { Math.random = oldRandom; }
});

test('the frequency penalty exempts character-fallback pieces', () => {
  const logits = Float32Array.from({length: 40}, (_, i) => (i === 3 ? 10 : 0));
  const pieces = { encode: s => s.trim().split(/\s+/).map(Number), idToToken: id => (id === 3 ? '##c' : `w${id}`) };
  const model = { config: { block_size: 64 }, forward: () => ({ logits, activations: {}, attention: [] }), attribute: () => ({}) };
  const gen = makeGenerator(model, pieces);
  const oldRandom = Math.random;
  Math.random = () => 0;
  try {
    gen.reset('3');
    // id 3 is a continuation piece, so a large penalty must leave it alone —
    // spelling a rare name has to be able to reuse letters.
    assert.equal(gen.step({temperature: 1, topk: 40, repPenalty: 20}).tokenId, 3);
  } finally { Math.random = oldRandom; }
});
