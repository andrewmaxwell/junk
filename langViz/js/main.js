// langViz — the visualization IS the app. Full-page canvas that auto-generates
// from a fixed prompt and shows each token flowing left->right through the model
// until the output tokens light up, with prompt, transport and stage controls.

import {loadModel} from './weights.js';
import {makeTokenizer} from './tokenizer.js';
import {makeModel} from './model.js';
import {makeGenerator} from './generate.js';
import {makeRenderer} from './renderer.js';

const DEFAULT_PROMPT = 'Thus saith the LORD';
const STEP_MS = 1100; // time between generated tokens
const WAVE_MS = 820; // how long the wave takes to sweep the network
// Sampling. MIN_P replaces top-k: it keeps every token within MIN_P x the top
// token's probability, so the candidate set narrows when the model is sure and
// widens when it isn't. REP_PENALTY subtracts a flat logit from whole words
// used in the last REP_WINDOW tokens (character-fallback pieces are exempt).
// Set MIN_P to 0 to fall back to TOP_K. Retuned after each retrain.
const TEMPERATURE = 1.0;
const MIN_P = 0.08;
const REP_PENALTY = 0.6;
const REP_WINDOW = 48;
const TOP_K = 40; // only used when MIN_P is 0
const LOOP_AFTER = 96; // restart from the prompt after this many tokens

// The stage rail + arrow keys. Fitting the whole network on screen pins the
// scale near 0.25, so the overview can only be an establishing shot — these are
// the framings that actually fill the viewport, in reading order along the spine.
function buildStageRail(renderer) {
  const nav = document.getElementById('stages');
  if (!nav) return;
  const buttons = renderer.stages.map((st, i) => {
    if (i === 1) nav.appendChild(Object.assign(document.createElement('span'), {className: 'sep'}));
    const b = document.createElement('button');
    b.type = 'button';
    // "block 2 · attention" -> "2 attn": the rail has to stay one short row
    b.textContent = st.name
      .replace(/^block (\d+) · attention$/, '$1 attn')
      .replace(/^block (\d+) · MLP$/, '$1 mlp');
    b.title = st.name;
    b.addEventListener('click', () => renderer.gotoStage(i));
    nav.appendChild(b);
    return b;
  });
  const highlight = (i) => {
    buttons.forEach((b, n) => b.classList.toggle('on', n === i));
    if (i >= 0) buttons[i].scrollIntoView({block: 'nearest', inline: 'center'});
  };
  renderer.onStageChange = highlight; // set-only hook on the renderer
  highlight(renderer.stageIndex);

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { renderer.nextStage(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { renderer.prevStage(); e.preventDefault(); }
    else if (e.key === 'Escape' || e.key === '0') { renderer.gotoStage(0); e.preventDefault(); }
  });
}

// The strip caption states the sampling actually in force. It used to be hard
// coded in index.html and went stale the moment these constants changed.
function describeSampling(config) {
  const cut = MIN_P > 0 ? `min-p ${MIN_P}` : `top ${TOP_K}`;
  const pen = REP_PENALTY > 0 ? ` \u00b7 rep ${REP_PENALTY}` : '';
  return `${config.block_size}-token context \u00b7 KJV-trained \u00b7 `
       + `sampling T=${TEMPERATURE} / ${cut}${pen}`;
}

async function init() {
  const loaded = await loadModel('.');
  const note = document.getElementById('samplingNote');
  if (note) note.textContent = describeSampling(loaded.config);
  const tokenizer = makeTokenizer(loaded.config.vocab);
  const model = makeModel(loaded);
  const gen = makeGenerator(model, tokenizer);
  // optional: per-neuron max-activating labels (neuron_labels.py). Tolerate absence.
  //
  // The file is keyed only by layer/unit index, so one left over from a
  // different architecture still loads and the inspector then reports confident
  // nonsense — and a file with too FEW layers is worse than none, because the
  // tooltip's missing-entry path reads "this unit rarely fires" rather than
  // admitting it has no data. Check the shape and drop it if it disagrees.
  const neuronLabels = await fetch('./neuron_labels.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((n) => {
      if (!n) return null;
      const { n_layers: nl, d_ff: ff } = loaded.config;
      if (n.n_layers === nl && n.d_ff === ff) return n;
      console.warn(
        `neuron_labels.json is for ${n.n_layers}x${n.d_ff}, model is ${nl}x${ff}` +
        ' — ignoring it (re-run neuron_labels.py). Hover inspector disabled.',
      );
      return null;
    });
  const renderer = makeRenderer(
    document.getElementById('viz'),
    loaded,
    neuronLabels,
  );

  for (const id of ['prompt', 'btnPlay', 'btnStep']) {
    document.getElementById(id).disabled = false;
  }
  renderer.start();
  renderer.setSpeed(WAVE_MS);
  buildStageRail(renderer);
  let prompt = DEFAULT_PROMPT;
  let editing = false;     // the prompt box has focus
  let userPaused = false;  // the user asked it to stop
  const isPaused = () => editing || userPaused;
  let promptLen = gen.reset(prompt).length;

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
      const origin = sampledTok != null && i === windowTokens.length - 1;
      html += `${space}<span class="${cls}${origin ? ' query' : ''}" data-w="${i}"${origin ? ' data-origin="1" title="This input token attends to the context to predict the highlighted next token"' : ''}>${esc(glyph(tok))}</span>`;
    }
    if (sampledTok != null) {
      const prev = windowTokens.length
        ? windowTokens[windowTokens.length - 1]
        : null;
      const space = tokenizer.needsSpaceBefore(prev, sampledTok) ? ' ' : '';
      html += `${space}<span class="n">${esc(glyph(sampledTok))}</span>`;
    }
    strip.innerHTML = html;
    // Let long windows wrap instead of shrinking or hiding the sampled token.
    renderer.updateArcs();
  }
  function showInputWindow() {
    const start = Math.max(0, gen.length - model.config.block_size);
    setStrip(gen.ids.slice(start).map((id) => tokenizer.idToToken(id)), null, start);
  }
  showInputWindow();

  // ---- prompt box ----
  // Start generating from whatever you type. Editing pauses the loop, so the
  // strip you are reading stops being overwritten mid-thought; committing
  // resets and resumes. The English character fallback does not cover every
  // Unicode character; unsupported tokens are called out in the counter.
  const promptEl = document.getElementById('prompt');
  const promptHintEl = document.getElementById('promptHint');

  function restart(text) {
    prompt = text;
    promptLen = gen.reset(prompt).length;
    renderer.reset();
    showInputWindow();
  }

  function showTokenCount() {
    if (!promptHintEl || !promptEl) return;
    const encoded = tokenizer.encode(promptEl.value.trim());
    const n = encoded.length;
    const unknown = encoded.filter(id => id === 0).length;
    const detail = `${n > model.config.block_size ? ` · last ${model.config.block_size} used` : ''}${unknown ? ` · ${unknown} unsupported` : ''}`;
    const dirty = promptEl.value.trim() !== prompt;
    promptHintEl.textContent = editing
      ? `${n} token${n === 1 ? '' : 's'}${detail} · ${dirty ? '↵ to run' : 'esc to return'}`
      : `${n} token${n === 1 ? '' : 's'}${detail}`;
    promptHintEl.classList.toggle('armed', editing && dirty);
  }

  // ---- transport ----
  // Generation is a clock running at STEP_MS. Everything else in the piece —
  // the lens rail, the attribution panel, the neuron inspector — is worth
  // reading for longer than one tick, so being able to stop the clock and
  // advance it by hand is what makes the rest of it usable.
  const btnPlay = document.getElementById('btnPlay');
  const btnStep = document.getElementById('btnStep');
  function syncTransport() {
    if (btnPlay) {
      btnPlay.textContent = userPaused ? 'play' : 'pause';
      btnPlay.classList.toggle('armed', userPaused);
    }
    showTokenCount();
  }
  function setPaused(v) { userPaused = v; syncTransport(); }
  function stepOnce() {
    if (editing) return;
    if (!userPaused) setPaused(true); // stepping implies stopping
    advanceOne();
  }
  if (btnPlay) btnPlay.addEventListener('click', () => setPaused(!userPaused));
  if (btnStep) btnStep.addEventListener('click', stepOnce);
  // keydown on the prompt input calls stopPropagation, so typing a space or a
  // period in the box never reaches this
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && e.target.closest?.('button')) return; // native button activation
    if (e.key === ' ') { setPaused(!userPaused); e.preventDefault(); }
    else if (e.key === '.') { stepOnce(); e.preventDefault(); }
  });

  if (promptEl) {
    promptEl.value = prompt;
    showTokenCount();
    promptEl.addEventListener('focus', () => { editing = true; showTokenCount(); });
    promptEl.addEventListener('input', showTokenCount);
    promptEl.addEventListener('keydown', (e) => {
      e.stopPropagation(); // the stage rail listens for arrow keys on window
      if (e.key === 'Enter') {
        const text = promptEl.value.trim() || DEFAULT_PROMPT;
        promptEl.value = text;
        restart(text);
        setPaused(false);
        editing = false;
        promptEl.blur();
        showTokenCount();
      } else if (e.key === 'Escape') {
        promptEl.value = prompt; // discard the edit
        editing = false;
        promptEl.blur();
        showTokenCount();
      }
    });
    promptEl.addEventListener('blur', () => {
      promptEl.value = prompt; // an uncommitted edit is not what is running
      editing = false;
      showTokenCount();
    });
  }

  function advanceOne() {
    if (gen.generatedCount >= LOOP_AFTER) {
      restart(prompt);
    } else {
      const snap = gen.step({
        temperature: TEMPERATURE, topk: TOP_K,
        minp: MIN_P, repPenalty: REP_PENALTY, repWindow: REP_WINDOW,
      });
      renderer.pushStep(snap);
      // gen.length now counts the just-pushed token; the window preceded it
      const startAbs = gen.length - 1 - snap.windowTokens.length;
      setStrip(snap.windowTokens, snap.token, startAbs);
    }
  }

  function tick() {
    if (!isPaused()) advanceOne();
    // poll faster while stopped so resuming feels immediate
    setTimeout(tick, isPaused() ? 120 : STEP_MS);
  }
  setTimeout(tick, 500); // let the first frame settle before the wave starts

  // dev handles: renderer for screenshot framing, parity vs parity.py
  window.__viz = renderer;
  window.__setPrompt = (t) => {
    const text = String(t).trim() || DEFAULT_PROMPT;
    restart(text);
    if (promptEl) promptEl.value = text;
    showTokenCount();
  };
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
  // Attribution is claimed to be EXACT, so make that checkable: the parts plus
  // the ln_f bias must reproduce the token's logit to float precision.
  window.__attribCheck = function (text = 'Thus saith the LORD', tokenId = null) {
    const ids = tokenizer.encode(text);
    const {logits, activations} = model.forward(ids);
    const target =
      tokenId == null
        ? logits.indexOf(Math.max(...logits))
        : tokenId;
    const a = model.attribute(activations, target);
    const err = Math.abs(a.verify - logits[target]);
    console.table(
      a.parts
        .map((p) => ({part: p.label, logits: +p.value.toFixed(4)}))
        .concat([
          {part: 'ln_f bias', logits: +a.bias.toFixed(4)},
          {part: '= TOTAL', logits: +a.verify.toFixed(4)},
          {part: 'actual logit', logits: +logits[target].toFixed(4)},
        ]),
    );
    console.log(
      `token ${target} ${JSON.stringify(tokenizer.idToToken(target))} · reconstruction error ${err.toExponential(2)}`,
    );
    return {tokenId: target, error: err, parts: a.parts};
  };
}

init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#c66;font:14px system-ui">${e.message} — serve over http (python3 -m http.server), not file://</div>`,
  );
});
