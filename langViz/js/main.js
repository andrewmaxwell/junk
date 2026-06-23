// langViz — the visualization IS the app. Full-page canvas that auto-generates
// from a fixed prompt and shows each token flowing left->right through the model
// until the output tokens light up. No chrome, no controls.

import {loadModel} from './weights.js';
import {makeTokenizer} from './tokenizer.js';
import {makeModel} from './model.js';
import {makeGenerator} from './generate.js';
import {makeRenderer} from './renderer.js';

const PROMPT = 'Thus saith the LORD ';
const STEP_MS = 1100; // time between generated tokens
const WAVE_MS = 820; // how long the wave takes to sweep the network
const TEMPERATURE = 0.8;
const TOP_K = 40;
const LOOP_AFTER = 96; // restart from the prompt after this many tokens

async function init() {
  const loaded = await loadModel('.');
  const tokenizer = makeTokenizer(loaded.config.vocab);
  const model = makeModel(loaded);
  const gen = makeGenerator(model, tokenizer);
  // optional: per-neuron max-activating labels (neuron_labels.py). Tolerate absence.
  const neuronLabels = await fetch('./neuron_labels.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const renderer = makeRenderer(
    document.getElementById('viz'),
    loaded,
    neuronLabels,
  );

  renderer.start();
  renderer.setSpeed(WAVE_MS);
  let promptLen = gen.reset(PROMPT).length;

  // fade the hint out
  const hint = document.getElementById('hint');
  setTimeout(() => hint && hint.classList.add('gone'), 5000);

  // The text strip shows the model's actual input WINDOW (what it can see) plus
  // the token it just produced, highlighted. Each window token span is tagged
  // with its window position so the renderer can draw attention arcs aligned to
  // the real words. Built here because the tokenizer owns spacing/word-pieces.
  const strip = document.getElementById('strip');
  const esc = (s) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c],
    );
  const glyph = (tok) =>
    tok.startsWith('##') ? tok.slice(2) : tok === '<UNK>' ? '◌' : tok;

  // windowTokens = the model's input; sampledTok = the token just produced (or
  // null on reset); windowStartAbs = absolute index of windowTokens[0], used to
  // colour the prompt (gold) vs generated tokens still inside the window.
  function setStrip(windowTokens, sampledTok, windowStartAbs) {
    let html = '';
    for (let i = 0; i < windowTokens.length; i++) {
      const tok = windowTokens[i];
      const space = tokenizer.needsSpaceBefore(
        i > 0 ? windowTokens[i - 1] : null,
        tok,
      )
        ? ' '
        : '';
      const cls = windowStartAbs + i < promptLen ? 'p' : 'g';
      html += `${space}<span class="${cls}" data-w="${i}">${esc(glyph(tok))}</span>`;
    }
    if (sampledTok != null) {
      const prev = windowTokens.length
        ? windowTokens[windowTokens.length - 1]
        : null;
      const space = tokenizer.needsSpaceBefore(prev, sampledTok) ? ' ' : '';
      html += `${space}<span class="n" data-origin="1">${esc(glyph(sampledTok))}</span>`;
    }
    strip.innerHTML = html;
    // scale the single line down to fit (so arcs to every token stay on screen)
    strip.style.fontSize = '14px';
    const avail = strip.clientWidth,
      need = strip.scrollWidth;
    if (need > avail && avail > 0)
      strip.style.fontSize = `${Math.max(9, (14 * avail) / need).toFixed(1)}px`;
    renderer.updateArcs();
  }
  setStrip(
    gen.ids.map((id) => tokenizer.idToToken(id)),
    null,
    0,
  );

  function tick() {
    if (gen.length >= LOOP_AFTER) {
      promptLen = gen.reset(PROMPT).length;
      renderer.reset();
      setStrip(
        gen.ids.map((id) => tokenizer.idToToken(id)),
        null,
        0,
      );
    } else {
      const snap = gen.step({temperature: TEMPERATURE, topk: TOP_K});
      renderer.pushStep(snap);
      // gen.length now counts the just-pushed token; the window preceded it
      const startAbs = gen.length - 1 - snap.windowTokens.length;
      setStrip(snap.windowTokens, snap.token, startAbs);
      console.log(snap.windowTokens.join(' '));
    }
    setTimeout(tick, STEP_MS);
  }
  setTimeout(tick, 500); // let the first frame settle before the wave starts

  // dev handles (no UI): renderer for screenshot framing, parity vs parity.py
  window.__viz = renderer;
  window.__parityCheck = function (text = 'Thus saith the LORD') {
    const ids = tokenizer.encode(text);
    const {logits} = model.forward(ids);
    const order = Array.from(logits.keys())
      .sort((a, b) => logits[b] - logits[a])
      .slice(0, 10);
    const top = order.map((i) => ({
      index: i,
      token: tokenizer.idToToken(i),
      logit: +logits[i].toFixed(5),
    }));
    console.table(top);
    return {ids, top};
  };
}

init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#c66;font:14px system-ui">${e.message} — serve over http (python3 -m http.server), not file://</div>`,
  );
});
