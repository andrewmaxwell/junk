// The main visualization: the whole tiny-GPT laid out around a horizontal
// residual-stream spine, with an attention branch arcing above each block and an
// MLP branch below. Free pan/zoom (everything scales — nothing hides), structural
// labels, zoom-in explainer plates, faint "ghost lanes" for the other window
// tokens (they merge into the stream only at attention), a hover inspector that
// labels MLP neurons by what they fire on, and a legend. Driven live by the
// generation loop — each generated token sends a left-to-right "wave" that lights
// up nodes and edges as it passes.
//
// Design notes
// ------------
// * Edge GEOMETRY is precomputed once after weights load. Each weight matrix is
//   split into sign (+/-) and ~16 |weight| buckets, each a single Path2D, so a
//   redraw is ~32 stroke() calls per matrix — only color/alpha changes per step.
// * Per-edge live "glow" at true per-edge resolution would be hundreds of
//   thousands of stroke calls, so we modulate edge alpha per MATRIX by its live
//   source*dest activation. NODES carry the true per-scalar activation colors, so
//   the data path is still read accurately, just with edges glowing per matrix.

const NB = 16;            // |weight| buckets per sign
const EDGE_BUCKET_FLOOR = 5; // skip the weakest ~30% of weights so edges read as
                             // distinct strands, not a solid hairball
const CX = 150;           // x spacing between column slots (world units)
const SPINE_H = 210;      // height of the residual spine column (world units)
const ATTN_H = 230;       // attention branch band height
const MLP_H = 250;        // mlp branch band height
const GAP = 26;           // gap between spine and a branch band (small offset only)
const OUT_H = 560;        // vertical spread of the 25 output nodes
const N_OUT = 25;

// "One token's journey": the spine is THIS token's residual stream. The other
// window tokens are faint parallel lanes just below it that never interact —
// except at each attention, where this token pulls in a blend of their values.
const N_GHOST = 5;        // how many of the most-attended other tokens to show
const GHOST_Y0 = 22;      // y of the first ghost lane (just below the spine line)
const GHOST_DY = 13;      // spacing between ghost lanes
const C_GHOST = [150, 140, 120];  // faint neutral lane color
const C_PULL = [232, 196, 130];   // warm color for values pulled in at attention

// attention panel (one per block, in the empty space above the attention branch):
// H stacked heat strips showing how the current token attends back over the window
const ATTN_PANEL_GAP = 260; // gap from attention band top up to the panel bottom
                            // (leaves a lane for the attn column labels + the
                            // zoom-in explainer plates above them, clear of panel)
const ATTN_ROW_H = 13;      // height of one head's strip
const ATTN_ROW_GAP = 5;

// diverging activation colormap endpoints (blue -neg, near-black ~0, orange +pos)
const C_ZERO = [34, 32, 28];
const C_NEG = [60, 130, 232];
const C_POS = [245, 150, 34];
// edge sign colors
const C_EPOS = [104, 166, 230];  // + weight (blue)
const C_ENEG = [206, 100, 96];   // - weight (red, slightly muted to match blue)
const C_STRUCT = [120, 176, 168]; // neutral structural connectors

// ---- small math helpers ----
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function lerpRGB(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
// h,s,l in [0,1] -> [r,g,b] 0..255
function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}
function rgba(c, a) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
function divColor(v, scale) {
  const t = clamp(v / scale, -1, 1);
  return t >= 0 ? lerpRGB(C_ZERO, C_POS, t) : lerpRGB(C_ZERO, C_NEG, -t);
}
// token -> on-screen glyph: ◌ for <UNK>, "·x" for a "##x" continuation piece.
const dispToken = (t) => (!t ? '' : t.startsWith('##') ? '·' + t.slice(2) : t === '<UNK>' ? '◌' : t);

export function makeRenderer(canvas, { config, tensors }, neuronLabels = null) {
  const ctx = canvas.getContext('2d');

  // Top text strip + attention-arc overlay (DOM text, canvas arcs aligned to it).
  const ioEl = document.getElementById('io');
  const stripEl = document.getElementById('strip');
  const arcsCanvas = document.getElementById('arcs');
  const arcsCtx = arcsCanvas ? arcsCanvas.getContext('2d') : null;
  let arcCenters = [];   // window position -> {x, y} screen coords within #io
  let arcOrigin = null;  // {x, y} of the just-produced token (arc source)
  let arcBaseY = 0;      // baseline y the arcs spring from

  // World DOM layer: children positioned in world coords, transformed in lockstep
  // with the canvas so they pan/zoom together. Built once layout is known below.
  const worldInner = document.getElementById('worldInner');
  const lensEls = []; // one chip per stage (embedding + each block)
  const D = config.d_model;
  const FF = config.d_ff;
  const L = config.n_layers;
  const H = config.n_heads;
  const vocab = config.vocab;
  const g = (n) => tensors.get(n);

  const ARC_LAYER = L - 1; // which layer's attention the top text-ribbon arcs show

  // one distinct hue per attention head, reused for strips + labels
  const headColors = Array.from({ length: H }, (_, h) =>
    hslToRgb(((205 + (h * 360) / H) % 360) / 360, 0.62, 0.64));
  const attnRowStep = ATTN_ROW_H + ATTN_ROW_GAP;

  // ---------------------------------------------------------------- layout ----
  // A column = a vertical stack of `count` nodes at world-x `x`, centered at
  // `yc` with band height `h`. Each carries a function to pull its last-position
  // activation vector out of a forward result.
  const columns = [];
  function addColumn(spec) {
    const { yc, h, count } = spec;
    const ys = new Float32Array(count);
    for (let i = 0; i < count; i++) ys[i] = yc - h / 2 + (i + 0.5) * (h / count);
    const col = {
      ...spec, ys, spacing: h / count,
      value: new Float32Array(count),   // current step target
      prev: new Float32Array(count),    // previous displayed (for easing)
      display: new Float32Array(count),
      scale: 1e-3,                      // EMA of max|value| for color norm
      meanAbs: 0,
    };
    columns.push(col);
    return col;
  }

  const yAttn = -(SPINE_H / 2 + GAP + ATTN_H / 2);
  const yMlp = SPINE_H / 2 + GAP + MLP_H / 2;
  const slotX = (s) => s * CX;

  // attention panels live above each attention branch; rows stack upward
  const attnPanelBottom = yAttn - ATTN_H / 2 - ATTN_PANEL_GAP;
  const attnPanelTop = attnPanelBottom - H * attnRowStep - 8;
  const attnRowY = (h) => attnPanelBottom - (h + 0.5) * attnRowStep;

  // spine columns are shared across block boundaries (slots 0,4,8,...,4L)
  const spineCols = new Map();
  function spineAt(slot, valueFn) {
    if (spineCols.has(slot)) return spineCols.get(slot);
    const c = addColumn({
      x: slotX(slot), yc: 0, h: SPINE_H, count: D,
      kind: 'spine', block: -1, label: 'residual', valueFn,
    });
    spineCols.set(slot, c);
    return c;
  }

  const matrices = [];   // weighted edge groups
  const connectors = []; // structural (neutral) edge groups
  const blockBoxes = []; // for skeleton + labels

  const sliceLast = (arr, w, lastPos) => arr.subarray(lastPos * w, lastPos * w + w);

  for (let b = 0; b < L; b++) {
    const s0 = b * 8;
    const p = `block.${b}`;

    const spineIn = spineAt(s0, (a, lp) =>
      b === 0 ? sliceLast(a.embeddings, D, lp) : sliceLast(a.layers[b - 1].residual, D, lp));
    const ln1 = addColumn({ x: slotX(s0 + 1), yc: yAttn, h: ATTN_H, count: D, kind: 'ln', block: b, label: 'LN', valueFn: (a, lp) => sliceLast(a.layers[b].ln1, D, lp) });
    const qCol = addColumn({ x: slotX(s0 + 2), yc: yAttn - ATTN_H / 3, h: ATTN_H / 3, count: D, kind: 'q', block: b, label: 'Q', valueFn: (a, lp) => sliceLast(a.layers[b].q, D, lp) });
    const kCol = addColumn({ x: slotX(s0 + 2), yc: yAttn, h: ATTN_H / 3, count: D, kind: 'k', block: b, label: 'K', valueFn: (a, lp) => sliceLast(a.layers[b].k, D, lp) });
    const vCol = addColumn({ x: slotX(s0 + 2), yc: yAttn + ATTN_H / 3, h: ATTN_H / 3, count: D, kind: 'v', block: b, label: 'V', valueFn: (a, lp) => sliceLast(a.layers[b].v, D, lp) });
    const attnOut = addColumn({ x: slotX(s0 + 3), yc: yAttn, h: ATTN_H, count: D, kind: 'attn_out', block: b, label: 'Attn out', valueFn: (a, lp) => sliceLast(a.layers[b].attnOut, D, lp) });
    const spineMid = spineAt(s0 + 4, (a, lp) => sliceLast(a.layers[b].residual_mid, D, lp));
    const ln2 = addColumn({ x: slotX(s0 + 5), yc: yMlp, h: MLP_H, count: D, kind: 'ln', block: b, label: 'LN', valueFn: (a, lp) => sliceLast(a.layers[b].ln2, D, lp) });
    const up = addColumn({ x: slotX(s0 + 6), yc: yMlp, h: MLP_H, count: FF, kind: 'up', block: b, label: '↑ proj', valueFn: (a, lp) => sliceLast(a.layers[b].mlp_pre, FF, lp) });
    const gelu = addColumn({ x: slotX(s0 + 7), yc: yMlp, h: MLP_H, count: FF, kind: 'gelu', block: b, label: 'GELU', valueFn: (a, lp) => sliceLast(a.layers[b].mlp_post, FF, lp) });
    const spineOut = spineAt(s0 + 8, (a, lp) => sliceLast(a.layers[b].residual, D, lp));

    // weighted matrices (source col, dest col, weight tensor, in, out)
    matrices.push(makeMatrix(ln1, qCol, g(`${p}.attn.W_Q`), D, D, b, 'W_Q'));
    matrices.push(makeMatrix(ln1, kCol, g(`${p}.attn.W_K`), D, D, b, 'W_K'));
    matrices.push(makeMatrix(ln1, vCol, g(`${p}.attn.W_V`), D, D, b, 'W_V'));
    matrices.push(makeMatrix(attnOut, spineMid, g(`${p}.attn.W_O`), D, D, b, 'W_O'));
    matrices.push(makeMatrix(ln2, up, g(`${p}.mlp.up.w`), D, FF, b, 'W_up'));
    matrices.push(makeMatrix(gelu, spineOut, g(`${p}.mlp.down.w`), FF, D, b, 'W_down'));

    // structural connectors (1:1, neutral)
    connectors.push(make1to1(spineIn, ln1, b));       // residual tap -> LN1
    connectors.push(make1to1(vCol, attnOut, b));      // value path (attention apply)
    connectors.push(make1to1(spineMid, ln2, b));      // residual tap -> LN2
    connectors.push(make1to1(up, gelu, b));           // GELU (elementwise)

    blockBoxes.push({
      b,
      x0: slotX(s0) - CX * 0.35, x1: slotX(s0 + 8) + CX * 0.35,
      attn: { yc: yAttn, h: ATTN_H, x0: slotX(s0 + 0.6), x1: slotX(s0 + 3.4) },
      mlp: { yc: yMlp, h: MLP_H, x0: slotX(s0 + 4.6), x1: slotX(s0 + 7.4) },
      cols: [spineIn, ln1, qCol, kCol, vCol, attnOut, spineMid, ln2, up, gelu, spineOut],
    });
  }

  // final LayerNorm + output (8 slots per block, so the last spine_out is at 8L)
  const finalSlot = 8 * L + 2;          // = 34 for L=4 (clear of the final lens chip)
  const lnF = addColumn({ x: slotX(finalSlot), yc: 0, h: SPINE_H, count: D, kind: 'ln', block: -1, label: 'LN_f', valueFn: (a, lp) => sliceLast(a.final, D, lp) });
  const outSlot = finalSlot + 2.4;
  const outX = slotX(outSlot);
  const outYs = new Float32Array(N_OUT);
  for (let i = 0; i < N_OUT; i++) outYs[i] = -OUT_H / 2 + (i + 0.5) * (OUT_H / N_OUT);
  let topOutputs = []; // [{token, prob, sampled}] current
  let attnData = null, attnTokens = [], attnLastPos = 0; // current step's attention
  let lensData = null; // [stage][{id, prob}] logit-lens guess at each depth
  let ghostList = [];     // [{k, token}] the other tokens shown as parallel lanes
  let ghostBlockW = [];   // [block] -> Float32Array(ghostList.length): pull weight
  const ghostY = (i) => GHOST_Y0 + i * GHOST_DY;

  // MLP hidden units (the ↑proj pre-activation and its GELU output are the same
  // d_ff neurons) are the hover-to-inspect targets for the neuron-label feature.
  const neuronCols = columns.filter((c) => c.kind === 'gelu' || c.kind === 'up');
  let hoverNeuron = null; // { block, j, x, y } in world coords

  // overall world bounds
  const worldBounds = (() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of columns) {
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.yc - c.h / 2); y1 = Math.max(y1, c.yc + c.h / 2);
    }
    x1 = Math.max(x1, outX + 650);  // just enough room on the right for the output token labels
    // include the explainer plates' regions (a banner above the titles, a row of
    // plates below the MLP bands) so the fit-to-view doesn't clip them
    y0 = Math.min(y0, -OUT_H / 2, attnPanelTop - 130);
    y1 = Math.max(y1, OUT_H / 2, yMlp + MLP_H / 2 + 260);
    const m = 80;
    return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m };
  })();

  // ---- precompute one matrix's bucketed Path2D geometry ----
  function makeMatrix(src, dst, W, din, dout, block, name) {
    let maxAbs = 1e-9;
    for (let i = 0; i < W.length; i++) { const a = Math.abs(W[i]); if (a > maxAbs) maxAbs = a; }
    const pos = Array.from({ length: NB }, () => new Path2D());
    const neg = Array.from({ length: NB }, () => new Path2D());
    for (let i = 0; i < din; i++) {
      const sx = src.x, sy = src.ys[i];
      const row = i * dout;
      for (let j = 0; j < dout; j++) {
        const w = W[row + j];
        if (w === 0) continue;
        const a = Math.abs(w) / maxAbs;
        const bk = Math.min(NB - 1, (a * NB) | 0);
        const path = w >= 0 ? pos[bk] : neg[bk];
        path.moveTo(sx, sy);
        path.lineTo(dst.x, dst.ys[j]);
      }
    }
    return {
      src, dst, name, block, pos, neg, maxAbs, activity: 0,
      midX: (src.x + dst.x) / 2,
      bbox: { x0: Math.min(src.x, dst.x), x1: Math.max(src.x, dst.x), y0: Math.min(src.yc - src.h / 2, dst.yc - dst.h / 2), y1: Math.max(src.yc + src.h / 2, dst.yc + dst.h / 2) },
    };
  }

  function make1to1(src, dst, block) {
    const n = Math.min(src.count, dst.count);
    const path = new Path2D();
    for (let i = 0; i < n; i++) { path.moveTo(src.x, src.ys[i]); path.lineTo(dst.x, dst.ys[i]); }
    return { src, dst, path, block, activity: 0, midX: (src.x + dst.x) / 2,
      bbox: { x0: Math.min(src.x, dst.x), x1: Math.max(src.x, dst.x), y0: Math.min(src.yc - src.h / 2, dst.yc - dst.h / 2), y1: Math.max(src.yc + src.h / 2, dst.yc + dst.h / 2) } };
  }

  // ----------------------------------------------------------------- view ----
  let dpr = 1, cssW = 0, cssH = 0;
  const view = { scale: 1, tx: 0, ty: 0 };

  function resize() {
    dpr = window.devicePixelRatio || 1;
    cssW = canvas.clientWidth || 800;
    cssH = canvas.clientHeight || 500;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function resetView() {
    const w = worldBounds.x1 - worldBounds.x0, h = worldBounds.y1 - worldBounds.y0;
    view.scale = Math.min(cssW / w, cssH / h);
    view.tx = -worldBounds.x0 * view.scale + (cssW - w * view.scale) / 2;
    view.ty = -worldBounds.y0 * view.scale + (cssH - h * view.scale) / 2;
  }

  const toWorld = (sx, sy) => ({ x: (sx - view.tx) / view.scale, y: (sy - view.ty) / view.scale });
  function viewRect() {
    const a = toWorld(0, 0), b = toWorld(cssW, cssH);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }
  const overlaps = (bb, vr) => !(bb.x1 < vr.x0 || bb.x0 > vr.x1 || bb.y1 < vr.y0 || bb.y0 > vr.y1);

  // -------------------------------------------------------------- pointer ----
  let dragging = false, lastPX = 0, lastPY = 0;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const before = toWorld(mx, my);
    const f = Math.exp(-e.deltaY * 0.0015);
    view.scale = clamp(view.scale * f, 0.05, 8);
    view.tx = mx - before.x * view.scale;
    view.ty = my - before.y * view.scale;
  }, { passive: false });
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    dragging = true; lastPX = e.clientX - r.left; lastPY = e.clientY - r.top;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (dragging) {
      view.tx += mx - lastPX; view.ty += my - lastPY; lastPX = mx; lastPY = my;
      hideNeuronTip();
      return;
    }
    updateHover(mx, my, e.clientX, e.clientY);
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('dblclick', () => resetView());
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { hoverNeuron = null; hideNeuronTip(); });

  // ---- neuron inspector: hover an MLP/GELU node to see what it fires on ----
  let neuronTip = null;
  function ensureTip() {
    if (neuronTip || !neuronLabels) return;
    neuronTip = document.createElement('div');
    neuronTip.id = 'neuronTip';
    document.body.appendChild(neuronTip);
  }
  function hideNeuronTip() { if (neuronTip) neuronTip.style.display = 'none'; }

  function updateHover(mx, my, clientX, clientY) {
    if (!neuronLabels) return;
    const wpt = toWorld(mx, my);
    let hit = null, bestDx = CX * 0.42;
    for (const c of neuronCols) {
      if (wpt.y < c.yc - c.h / 2 || wpt.y > c.yc + c.h / 2) continue;
      const dx = Math.abs(c.x - wpt.x);
      if (dx >= bestDx) continue;
      const i = Math.floor((wpt.y - (c.yc - c.h / 2)) / c.spacing);
      if (i < 0 || i >= c.count) continue;
      bestDx = dx;
      hit = { block: c.block, j: i, x: c.x, y: c.ys[i] };
    }
    hoverNeuron = hit;
    if (!hit) { hideNeuronTip(); return; }
    ensureTip();
    const lay = neuronLabels.layers[hit.block];
    const n = lay && lay[hit.j];
    const triggers = n && n.t && n.t.length
      ? n.t.map(dispToken).join('  ·  ') : null;
    let html = `<div class="nt-h">block ${hit.block} · neuron ${hit.j}</div>`;
    if (triggers) {
      html += `<div class="nt-t">fires most on:&nbsp; ${escapeHtml(triggers)}</div>`;
      if (n.ctx) html += `<div class="nt-ctx">“…${escapeHtml(n.ctx)}”</div>`;
      html += `<div class="nt-dim">peak activation ${n.peak}</div>`;
    } else {
      html += `<div class="nt-dim">this unit rarely fires</div>`;
    }
    neuronTip.innerHTML = html;
    neuronTip.style.display = 'block';
    // place near the cursor, flipping if it would run off the right/bottom edge
    const pad = 14, tw = neuronTip.offsetWidth, th = neuronTip.offsetHeight;
    let px = clientX + pad, py = clientY + pad;
    if (px + tw > window.innerWidth - 4) px = clientX - pad - tw;
    if (py + th > window.innerHeight - 4) py = clientY - pad - th;
    neuronTip.style.left = `${Math.max(4, px)}px`;
    neuronTip.style.top = `${Math.max(4, py)}px`;
  }
  const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // --------------------------------------------------------------- waves -----
  // Each generated token starts a wave that sweeps wavePos across the world.
  let waveActive = false, waveStart = 0, waveDuration = 700;
  let waveX0 = worldBounds.x0, waveX1 = worldBounds.x1;

  function setSpeed(ms) { waveDuration = clamp(ms + 280, 280, 1600); }

  function pushStep(snap) {
    // capture previous displayed values, set new targets
    for (const c of columns) {
      c.prev.set(c.display);
      const v = c.valueFn(snap.activations, snap.lastPos);
      let mx = 1e-3, sum = 0;
      for (let i = 0; i < c.count; i++) {
        const x = v[i]; c.value[i] = x;
        const ax = Math.abs(x); if (ax > mx) mx = ax; sum += ax;
      }
      c.scale = Math.max(mx, c.scale * 0.6); // EMA-ish, decays toward current max
      c.meanAbs = sum / c.count;
    }
    // per-matrix activity = normalized product of mean|src| * mean|dst|
    let maxAct = 1e-9;
    for (const m of matrices) { m.rawAct = m.src.meanAbs * m.dst.meanAbs; if (m.rawAct > maxAct) maxAct = m.rawAct; }
    for (const m of matrices) m.activity = m.rawAct / maxAct;
    for (const cN of connectors) cN.activity = clamp((cN.src.meanAbs + cN.dst.meanAbs) * 0.5, 0, 1);

    topOutputs = snap.topOutputs || [];
    attnData = snap.attention || null;          // [layer][head][query][key]
    attnTokens = snap.windowTokens || [];
    attnLastPos = snap.lastPos || 0;
    lensData = (snap.activations && snap.activations.lens) || null;
    computeGhosts();
    updateLensDom();
    updateAttnDom();
    updateOutputDom();

    waveActive = true; waveStart = performance.now();
  }

  function reset() {
    for (const c of columns) { c.display.fill(0); c.prev.fill(0); c.value.fill(0); c.scale = 1e-3; c.meanAbs = 0; }
    for (const m of matrices) m.activity = 0;
    for (const cN of connectors) cN.activity = 0;
    topOutputs = [];
    attnData = null; attnTokens = []; attnLastPos = 0;
    lensData = null;
    ghostList = []; ghostBlockW = [];
    waveActive = false;
    updateAttnDom();
    updateOutputDom();
  }

  // -------------------------------------------------------------- drawing ----
  let wavePos = Infinity, waveFront = Infinity, nowT = 0;

  function advance(now) {
    nowT = now;
    if (waveActive) {
      const t = (now - waveStart) / waveDuration;
      wavePos = lerp(waveX0 - CX, waveX1 + CX, clamp(t, 0, 1));
      waveFront = wavePos;
      if (t >= 1) { waveActive = false; }
    } else {
      waveFront = Infinity;
    }
    // ease node display toward target based on whether the wave passed the column
    for (const c of columns) {
      const passed = (waveFront === Infinity) ? 1 : clamp((waveFront - c.x) / (CX * 0.8) + 0.5, 0, 1);
      for (let i = 0; i < c.count; i++) c.display[i] = lerp(c.prev[i], c.value[i], passed);
    }
  }

  const waveGlow = (x) => {
    if (waveFront === Infinity) return 0;
    const d = (waveFront - x) / (CX * 1.4);
    return Math.exp(-d * d);
  };

  function frame() {
    advance(performance.now());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.tx * dpr, view.ty * dpr);
    const vr = viewRect();
    const sc = view.scale;

    // Nothing disappears with zoom. Edges only fade DOWN (never out) when zoomed
    // out so the haze doesn't drown the nodes; faint structure boxes stay.
    const edgeF = lerp(0.5, 0.85, smoothstep(0.2, 1.0, sc));

    drawSpine();
    drawBoxes();
    for (const m of matrices) { if (overlaps(m.bbox, vr)) drawMatrixEdges(m, edgeF, sc); }
    drawConnectors(vr, sc);
    drawGhosts(sc);
    drawNodes(vr, sc);
    drawHoverRing(sc);
    drawAttention(sc);
    drawOutput(sc);

    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLegend();
    drawTopArcs(); // attention arcs on the DOM text strip (its own overlay canvas)
    syncWorld();   // keep the world DOM layer (labels, lens chips, attn/output text) in lockstep

    raf = requestAnimationFrame(frame);
  }

  function drawSpine() {
    // the residual highway
    const x0 = slotX(0), x1 = lnF.x;
    ctx.lineWidth = Math.max(SPINE_H * 0.9, 2 / view.scale);
    ctx.strokeStyle = 'rgba(150,140,120,0.05)';
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeStyle = 'rgba(200,180,140,0.5)';
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(lnF.x + 60, 0); ctx.stroke();
  }

  // Faint structural boxes, always drawn (at every zoom level), tinted by the
  // block's live activity so you can read where the action is from far away.
  function drawBoxes() {
    ctx.lineWidth = 1.5 / view.scale;
    for (const bx of blockBoxes) {
      const act = blockActivity(bx);
      roundRect(bx.x0, yAttn - ATTN_H / 2 - 30, bx.x1 - bx.x0, (yMlp + MLP_H / 2 + 30) - (yAttn - ATTN_H / 2 - 30), 18);
      ctx.fillStyle = rgba([54, 47, 36], 0.14);
      ctx.fill();
      ctx.strokeStyle = rgba([140, 122, 92], 0.26);
      ctx.stroke();
      blob(bx.attn, lerpRGB([74, 96, 140], C_POS, act), 0.5 + 0.4 * act);
      blob(bx.mlp, lerpRGB([100, 78, 132], C_POS, act), 0.5 + 0.4 * act);
    }
  }
  function blob(r, c, a) {
    roundRect(r.x0, r.yc - r.h / 2, r.x1 - r.x0, r.h, 26);
    ctx.fillStyle = rgba(c, 0.16 * a);
    ctx.fill();
    ctx.strokeStyle = rgba(c, 0.4 * a);
    ctx.stroke();
  }
  function blockActivity(bx) {
    let s = 0, n = 0;
    for (const c of bx.cols) { s += c.meanAbs / Math.max(c.scale, 1e-3); n++; }
    return clamp(s / Math.max(n, 1), 0, 1);
  }

  function drawMatrixEdges(m, edgeF, sc) {
    const glow = 0.5 + 0.5 * m.activity + 1.8 * waveGlow(m.midX) * (0.4 + m.activity);
    ctx.lineWidth = 0.5 / sc;
    // Only the stronger weights are drawn (quadratic emphasis), so a matrix reads
    // as distinct strands rather than a 4096-line wash. Weak weights are
    // near-invisible anyway; the nodes still carry every activation.
    for (let bk = EDGE_BUCKET_FLOOR; bk < NB; bk++) {
      const base = (bk + 0.5) / NB;
      const a = clamp(base * base * 0.6 * glow * edgeF, 0, 0.62);
      if (a < 0.01) continue;
      ctx.strokeStyle = rgba(C_EPOS, a); ctx.stroke(m.pos[bk]);
      ctx.strokeStyle = rgba(C_ENEG, a); ctx.stroke(m.neg[bk]);
    }
  }

  function drawConnectors(vr, sc) {
    ctx.lineWidth = 0.8 / sc;
    for (const cN of connectors) {
      if (!overlaps(cN.bbox, vr)) continue;
      const glow = 0.35 + 0.65 * cN.activity + waveGlow(cN.midX);
      const a = clamp(0.13 * glow, 0, 0.5);
      if (a < 0.01) continue;
      ctx.strokeStyle = rgba(C_STRUCT, a);
      ctx.stroke(cN.path);
    }
  }

  function drawNodes(vr, sc) {
    for (const c of columns) {
      if (c.x < vr.x0 - 20 || c.x > vr.x1 + 20) continue;
      const sz = Math.max(c.spacing * 0.8, 2.0 / sc); // never smaller than ~2px
      const half = sz / 2;
      for (let i = 0; i < c.count; i++) {
        const y = c.ys[i];
        if (y < vr.y0 - sz || y > vr.y1 + sz) continue;
        ctx.fillStyle = rgba(divColor(c.display[i], c.scale), 1);
        ctx.fillRect(c.x - half, y - half, sz, sz);
      }
    }
  }

  // ---- "one token's journey": choose which other tokens to show as lanes ----
  // The spine is THIS (last) token. Pick the other window positions it attends to
  // most (summed over every block + head), and record how strongly it pulls each
  // one in at each block — so the lanes can fan into that block's attention.
  function computeGhosts() {
    ghostList = []; ghostBlockW = [];
    if (!attnData) return;
    const winLen = attnLastPos + 1;
    if (winLen <= 1) return;
    const total = new Float64Array(winLen);
    for (let b = 0; b < attnData.length; b++)
      for (let h = 0; h < H; h++) {
        const row = attnData[b][h] && attnData[b][h][attnLastPos];
        if (!row) continue;
        for (let k = 0; k < winLen; k++) total[k] += row[k] || 0;
      }
    const order = [];
    for (let k = 0; k < winLen; k++) if (k !== attnLastPos && total[k] > 1e-4) order.push(k);
    order.sort((a, b) => total[b] - total[a]);
    const picks = order.slice(0, N_GHOST);
    ghostList = picks.map((k) => ({ k, token: attnTokens[k] }));
    for (let b = 0; b < attnData.length; b++) {
      const w = new Float32Array(picks.length);
      for (let i = 0; i < picks.length; i++) {
        let s = 0;
        for (let h = 0; h < H; h++) { const row = attnData[b][h] && attnData[b][h][attnLastPos]; if (row) s += row[picks[i]] || 0; }
        w[i] = s / H;
      }
      ghostBlockW[b] = w;
    }
  }

  // Draw the ghost lanes (faint parallel streams = the other tokens) and, at each
  // block, the warm "value pull" curves fanning from those lanes up into that
  // block's attention output — the ONE place tokens influence each other.
  function drawGhosts(sc) {
    if (!ghostList.length) return;
    const x0 = slotX(0), x1 = lnF.x;
    ctx.lineWidth = 1 / sc;
    // faint parallel lanes + a left-edge token label each
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.font = `12px ui-monospace, Menlo, monospace`;
    for (let i = 0; i < ghostList.length; i++) {
      const y = ghostY(i);
      ctx.strokeStyle = rgba(C_GHOST, 0.16);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = rgba(C_GHOST, 0.7);
      ctx.fillText(dispToken(ghostList[i].token), x0 - 10, y);
    }
    ctx.textAlign = 'left';
    // value-pull fans: from each lane (at the V column) up to attn out, per block,
    // brightening as the wave reaches the block and scaled by how much it attends.
    for (let b = 0; b < blockBoxes.length; b++) {
      const w = ghostBlockW[b]; if (!w) continue;
      const s0 = b * 8;
      const sx = slotX(s0 + 2), tx = slotX(s0 + 3);
      const passed = waveFront === Infinity ? 1 : clamp((waveFront - tx) / (CX * 0.8) + 0.5, 0, 1);
      if (passed <= 0.001) continue;
      for (let i = 0; i < ghostList.length; i++) {
        const wi = w[i]; if (wi < 0.03) continue;
        const sy = ghostY(i);
        const a = clamp((0.12 + 0.7 * wi) * passed, 0, 0.85);
        ctx.lineWidth = (0.5 + 2.2 * wi) / sc;
        ctx.strokeStyle = rgba(C_PULL, a);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + tx) / 2, (sy + yAttn) / 2 - 30, tx, yAttn);
        ctx.stroke();
      }
    }
  }

  // Per-block attention panels: for each head, a heat strip over the window
  // positions showing where the CURRENT (last) token's query attends. This is
  // the one mechanism a residual/activation view can't otherwise show — the
  // model relating token positions to each other.
  function drawAttention(sc) {
    if (!attnData) return;
    const winLen = attnLastPos + 1;
    for (const bx of blockBoxes) {
      const layer = attnData[bx.b];
      if (!layer) continue;
      const x0 = bx.attn.x0, x1 = bx.attn.x1, w = x1 - x0;
      const cellW = w / winLen;
      const minW = Math.max(cellW, 0.6 / sc);
      // fill in with the wave as it sweeps past this block
      const passed = waveFront === Infinity ? 1 : clamp((waveFront - (x0 + x1) / 2) / (CX * 0.8) + 0.5, 0, 1);
      if (passed <= 0.001) continue;
      for (let h = 0; h < H; h++) {
        const row = layer[h] && layer[h][attnLastPos];
        if (!row) continue;
        let rmax = 1e-6;
        for (let k = 0; k < winLen; k++) if (row[k] > rmax) rmax = row[k];
        const yc = attnRowY(h), yTop = yc - ATTN_ROW_H / 2;
        ctx.fillStyle = rgba([42, 38, 31], 0.55 * passed); // track
        ctx.fillRect(x0, yTop, w, ATTN_ROW_H);
        const col = headColors[h];
        for (let k = 0; k < winLen; k++) {
          const b = (row[k] || 0) / rmax;
          if (b < 0.04) continue;
          ctx.fillStyle = rgba(col, (0.1 + 0.9 * b) * passed);
          ctx.fillRect(x0 + k * cellW, yTop, minW, ATTN_ROW_H);
        }
        // mark the query (current) token's own column
        ctx.lineWidth = 1 / sc;
        ctx.strokeStyle = rgba([255, 240, 200], 0.7 * passed);
        ctx.strokeRect(x0 + attnLastPos * cellW, yTop, minW, ATTN_ROW_H);
      }
    }
  }

  // ring around the neuron currently under the cursor (paired across ↑proj/GELU)
  function drawHoverRing(sc) {
    if (!hoverNeuron) return;
    const r = Math.max(7 / sc, 6);
    ctx.lineWidth = 2 / sc;
    ctx.strokeStyle = rgba([255, 240, 198], 0.95);
    for (const c of neuronCols) {
      if (c.block !== hoverNeuron.block) continue;
      ctx.beginPath(); ctx.arc(c.x, c.ys[hoverNeuron.j], r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function drawOutput(sc) {
    if (!topOutputs.length) return;
    const maxP = topOutputs[0].prob || 1;
    ctx.lineWidth = 1 / sc;
    for (let i = 0; i < topOutputs.length && i < N_OUT; i++) {
      const o = topOutputs[i], y = outYs[i];
      const t = clamp(o.prob / maxP, 0, 1);
      ctx.strokeStyle = rgba(C_POS, (0.1 + 0.65 * t) * 0.8);
      ctx.beginPath(); ctx.moveTo(lnF.x, lerp(-SPINE_H / 2, SPINE_H / 2, i / N_OUT)); ctx.lineTo(outX, y); ctx.stroke();
      const r = lerp(3, 13, t);
      ctx.beginPath(); ctx.arc(outX, y, r, 0, Math.PI * 2);
      ctx.fillStyle = rgba(o.sampled ? [255, 224, 150] : C_POS, 0.3 + 0.7 * t);
      ctx.fill();
      if (o.sampled) { ctx.lineWidth = 2.4 / sc; ctx.strokeStyle = rgba([255, 244, 205], 1); ctx.stroke(); }
    }
  }

  // one-line plain-English gloss for each column, so the abbreviations mean
  // something to a first-time viewer
  function columnGloss(c) {
    switch (c.kind) {
      case 'ln': return c.label === 'LN_f' ? 'final normalize' : 'normalize';
      case 'q': return 'query';
      case 'k': return 'key';
      case 'v': return 'value';
      case 'attn_out': return 'weighted values';
      case 'up': return `${D}→${FF}`;
      case 'gelu': return 'nonlinear';
      default: return '';
    }
  }

  // Structural labels as world-space DOM (created once, in #worldInner): block
  // titles, the Attention/MLP watermarks, per-column names + glosses, input /
  // output, and the residual-stream caption. CSS lays each out; --col / --sub
  // (set per frame in syncWorld) fade column detail in as you zoom. World font
  // sizes mean they scale with the network exactly like the canvas did.
  const F_TITLE = 46, F_BRANCH = 40, F_COL = 27, F_SUB = 18, F_IO = 40;
  function mkWL(cls, text, wx, wy, fontPx, anchor = 'translate(-50%,-50%)') {
    const el = document.createElement('div');
    el.className = `wl ${cls}`;
    el.textContent = text;
    el.style.left = `${wx}px`;
    el.style.top = `${wy}px`;
    el.style.fontSize = `${fontPx}px`;
    el.style.transform = anchor;
    worldInner.appendChild(el);
    return el;
  }
  function buildWorldLabels() {
    if (!worldInner) return;
    for (const bx of blockBoxes) {
      const cx = (bx.x0 + bx.x1) / 2;
      mkWL('wl-title', `Block ${bx.b}`, cx, attnPanelTop - 58, F_TITLE);
      mkWL('wl-subtitle', 'one transformer layer', cx, attnPanelTop - 30, F_SUB);
      // watermark over the LN column (left of Q/K/V) so it never sits on a label
      const ax = bx.attn.x0 + CX * 0.4, mx = bx.mlp.x0 + CX * 0.4;
      mkWL('wl-mark-a', 'Attention', ax, yAttn, F_BRANCH);
      mkWL('wl-mark-a-sub', 'mix info across tokens', ax, yAttn + F_BRANCH * 0.82, F_SUB);
      mkWL('wl-mark-m', 'MLP', mx, yMlp, F_BRANCH);
      mkWL('wl-mark-m-sub', 'think per token', mx, yMlp + F_BRANCH * 0.82, F_SUB);
    }
    // input: below the spine's left end (clear of the embedding lens chip above it)
    mkWL('wl-io', '▸ input', slotX(0), SPINE_H / 2 + 30, F_IO, 'translate(0,-50%)');
    mkWL('wl-io-sub', `this token · ${D} dims`, slotX(0), SPINE_H / 2 + 30 + F_IO * 0.7, F_SUB, 'translate(0,-50%)');
    mkWL('wl-io', 'output', outX, -OUT_H / 2 - 54, F_IO);
    mkWL('wl-io-sub', 'next-token probabilities', outX, -OUT_H / 2 - 54 + F_IO * 0.72, F_SUB);

    for (const c of columns) {
      if (c.kind === 'spine') continue;
      const gloss = columnGloss(c);
      // Q/K/V are three thin bands stacked at one x — label each beside its band
      if (c.kind === 'q' || c.kind === 'k' || c.kind === 'v') {
        mkWL('wl-col', c.label, c.x - 14, c.yc, F_COL, 'translate(-100%,-50%)');
        if (gloss) mkWL('wl-gloss', gloss, c.x + 14, c.yc, F_SUB, 'translate(0,-50%)');
        continue;
      }
      const top = c.yc - c.h / 2;
      mkWL('wl-col', c.label, c.x, top - 50, F_COL);
      if (gloss) mkWL('wl-gloss', gloss, c.x, top - 24, F_SUB);
    }
    // The down-projection (gelu → residual) has no node column of its own, and
    // sits only half a slot from GELU — so label it BELOW the MLP band (empty
    // space), the way the attention labels sit outside their band.
    for (const m of matrices) {
      if (m.name !== 'W_down') continue;
      const yb = yMlp + MLP_H / 2;
      mkWL('wl-col', '↓ proj', m.midX, yb + 34, F_COL);
      mkWL('wl-gloss', `shrink ${FF}→${D}`, m.midX, yb + 58, F_SUB);
    }
    mkWL('wl-res', `residual stream · this token's running ${D}-dim vector`, slotX(0) + CX * 3.2, -16, F_COL);
  }

  // Zoom-in explainer plates: a short paragraph describing each kind of op, so a
  // curious viewer can zoom into a part and read what it does + why it matters.
  // To stay uncluttered we annotate ONLY block 0 (all blocks are structurally
  // identical) plus the shared input / residual / final-norm, and call that out.
  const F_DESC = 13, DESC_W = 150;
  function mkDesc(html, wx, wy, anchor, width = DESC_W) {
    const el = mkWL('wl-desc', '', wx, wy, F_DESC, anchor);
    el.innerHTML = html;
    el.style.width = `${width}px`;
    return el;
  }
  function buildDescriptions() {
    if (!worldInner || !blockBoxes.length) return;
    // --- attention branch (block 0): plates sit in the lane above the labels ---
    const aBot = yAttn - ATTN_H / 2 - 80; // bottom of the plate, clear above labels
    const up = 'translate(-50%,-100%)';
    mkDesc(`<b>LayerNorm.</b> Rescales the token's ${D} numbers to mean 0, spread 1, then ×/＋ learned weights — a stable range before the branch reads it.`, slotX(1), aBot, up);
    mkDesc(`<b>Q · K · V.</b> Three learned views of the token. <b>Query</b> = what I'm looking for, <b>Key</b> = what I advertise, <b>Value</b> = what I'll hand over. Query·Key scores the match.`, slotX(2), aBot, up);
    mkDesc(`<b>Weighted values.</b> Each token's Value, blended by how well the query matched its Key. The one place other tokens' information enters this one.`, slotX(3), aBot, up);
    // --- MLP branch (block 0): plates sit below the band AND below the ↓proj
    // label row, so they never collide with it ---
    const mTop = yMlp + MLP_H / 2 + 78;
    const dn = 'translate(-50%,0)';
    mkDesc(`<b>LayerNorm.</b> Same operation as before — restandardizes the token before the MLP reads it.`, slotX(5), mTop, dn);
    mkDesc(`<b>↑ proj.</b> Expands ${D}→${FF}, giving the nonlinearity room to detect many features at once.`, slotX(6), mTop, dn);
    mkDesc(`<b>GELU.</b> The nonlinearity: each of the ${FF} units acts as a soft on/off gate. Without it the two projections collapse into one linear step. The result is squeezed ${FF}→${D} and added back to the stream. <b>Hover any ${FF}-wide node to see what it fires on.</b>`, slotX(7), mTop, dn);
    // --- shared: input, residual, "other tokens" in the wide far-left open space;
    // wider plates (fewer lines) stacked with generous gaps so they never touch ---
    const ix = slotX(0), tl = 'translate(0,0)', LW = 280;
    const byc = SPINE_H / 2 + 30 + F_IO * 0.7 + 22; // = top of the input plate
    mkDesc(`<b>Input.</b> Just the <i>last</i> token of the window, as a ${D}-dim vector (word + position). The earlier tokens are processed too, but reach this one only through Attention.`, ix, byc, tl, LW);
    mkDesc(`<b>Residual stream.</b> The token's running ${D}-dim vector (this spine). Every block reads a copy and adds its edit back — a shared scratchpad. That additivity is why deep nets train, and why the running guess is readable at any depth.`, ix, byc + 150, tl, LW);
    mkDesc(`<b>The other tokens.</b> These faint lanes are the window's other tokens, each on its own identical journey. They never interact — <i>except</i> at Attention, where this token pulls in a warm blend of their values (brighter = attended more).`, ix, byc + 315, tl, LW);
    // final norm sits in the far-right open space below the spine
    mkDesc(`<b>Final LayerNorm.</b> One last restandardize before the vector is compared against every word's embedding to score the next token.`, lnF.x, SPINE_H / 2 + 30, dn);
    // --- "why 4 blocks": a banner in the open band above the titles ---
    const cx = (blockBoxes[0].x0 + blockBoxes[blockBoxes.length - 1].x1) / 2;
    mkDesc(`<b>Why ${L} blocks?</b> All ${L} are identical in structure (each with its own learned weights). Depth = repeated refinement — watch the logit-lens guess above the spine sharpen from block to block.`, cx, attnPanelTop - 30, 'translate(-50%,-100%)', 360);
  }
  // Attention panel labels as world DOM (so they scale with the network): the
  // "attends to →" caption and per-head h-labels are static; the single
  // most-attended token per head is updated each step in updateAttnDom().
  const attnEls = []; // [block] -> { x0, x1, heads: [{ tokEl }] }
  function buildAttnDom() {
    if (!worldInner || attnEls.length) return;
    for (const bx of blockBoxes) {
      const x0 = bx.attn.x0, x1 = bx.attn.x1;
      mkWL('wl-attn-cap', 'attends to →', (x0 + x1) / 2, attnPanelTop, 13);
      const heads = [];
      for (let h = 0; h < H; h++) {
        const yc = attnRowY(h);
        const hEl = mkWL('wl-attn-h', `h${h}`, x0 - 9, yc, 12, 'translate(-100%,-50%)');
        hEl.style.color = rgba(headColors[h], 0.95);
        const tokEl = mkWL('wl-attn-tok', '', x0, yc - ATTN_ROW_H, 12);
        tokEl.style.display = 'none';
        heads.push({ tokEl });
      }
      attnEls.push({ x0, x1, heads });
    }
  }
  function updateAttnDom() {
    if (!attnEls.length) return;
    const winLen = attnLastPos + 1;
    for (let b = 0; b < attnEls.length; b++) {
      const layer = attnData && attnData[b];
      const { x0, x1, heads } = attnEls[b];
      const cellW = (x1 - x0) / winLen;
      for (let h = 0; h < H; h++) {
        const row = layer && layer[h] && layer[h][attnLastPos];
        const tokEl = heads[h].tokEl;
        if (!row) { tokEl.style.display = 'none'; continue; }
        let kb = 0, mb = -1;
        for (let k = 0; k < winLen; k++) if (row[k] > mb) { mb = row[k]; kb = k; }
        const tok = attnTokens[kb];
        if (!tok) { tokEl.style.display = 'none'; continue; }
        tokEl.style.display = '';
        tokEl.textContent = dispToken(tok);
        tokEl.style.left = `${x0 + (kb + 0.5) * cellW}px`;
      }
    }
  }

  // Output token list as world DOM (scales with the network): one label to the
  // right of each output node, updated each step from the true distribution.
  const OUT_LABEL_DX = 24; // world px right of the node center (clears the dot)
  const outEls = [];
  function buildOutputDom() {
    if (!worldInner || outEls.length) return;
    for (let i = 0; i < N_OUT; i++) {
      const el = mkWL('wl-out', '', outX + OUT_LABEL_DX, outYs[i], 16, 'translate(0,-50%)');
      el.style.display = 'none';
      outEls.push(el);
    }
  }
  function updateOutputDom() {
    if (!outEls.length) return;
    for (let i = 0; i < N_OUT; i++) {
      const o = topOutputs[i], el = outEls[i];
      if (!o) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.classList.toggle('sampled', !!o.sampled);
      el.textContent = `${dispToken(o.token)}  ${(o.prob * 100).toFixed(1)}%`;
    }
  }

  // Logit lens (world-space DOM, in #worldInner): the model's running top-3 guess
  // for the next token, read off the residual stream at each depth via the final
  // LayerNorm + tied unembedding. One chip sits above the spine at each block
  // boundary, so you watch the guess go from a vague/common word at the embedding
  // to the real answer by the last block. A guess that already matches the FINAL
  // top-1 is gold — the layer where the decision locks in. As world DOM the chips
  // pan/zoom with the network and CSS handles their layout.
  const LENS_ANCHOR_Y = -SPINE_H / 2 - 16; // bottom-center anchor, just above the spine
  function buildLensChips() {
    if (!worldInner || lensEls.length) return;
    for (let i = 0; i <= L; i++) {
      const el = document.createElement('div');
      el.className = 'lens';
      el.style.left = `${slotX(i * 8)}px`;
      el.style.top = `${LENS_ANCHOR_Y}px`;
      el.style.transform = 'translate(-50%, -100%)';
      el.style.opacity = '0';
      const hdr = document.createElement('div');
      hdr.className = 'lhdr';
      hdr.textContent = i === 0 ? 'guess · embedding'
        : i === L ? `guess · after block ${i - 1} · final` : `guess · after block ${i - 1}`;
      el.appendChild(hdr);
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = document.createElement('div'); row.className = 'lrow';
        const bar = document.createElement('div'); bar.className = 'lbar';
        const tok = document.createElement('span'); tok.className = 'ltok';
        const pct = document.createElement('span'); pct.className = 'lpct';
        row.append(bar, tok, pct);
        el.appendChild(row);
        rows.push({ row, bar, tok, pct });
      }
      worldInner.appendChild(el);
      lensEls.push({ el, rows });
    }
  }

  // Refresh chip text from the latest lensData (called once per generated token).
  const LENS_BAR_W = 210 - 8;
  function updateLensDom() {
    if (!lensEls.length || !lensData) return;
    const finalTop = lensData[lensData.length - 1];
    const finalId = finalTop && finalTop[0] ? finalTop[0].id : -1;
    for (let i = 0; i < lensEls.length; i++) {
      const top = lensData[i] || [];
      const maxP = top[0] ? top[0].prob || 1 : 1;
      const { rows } = lensEls[i];
      for (let r = 0; r < rows.length; r++) {
        const o = top[r];
        if (!o) { rows[r].row.style.display = 'none'; continue; }
        rows[r].row.style.display = '';
        rows[r].row.classList.toggle('locked', o.id === finalId);
        rows[r].tok.textContent = dispToken(vocab[o.id]);
        rows[r].pct.textContent = `${(o.prob * 100).toFixed(0)}%`;
        rows[r].bar.style.width = `${clamp(o.prob / maxP, 0, 1) * LENS_BAR_W}px`;
      }
    }
  }

  // Keep the world DOM layer's transform identical to the canvas's, and fade the
  // chips: hidden when there's no data or at extreme zoom-out, dim until the wave
  // sweeps past each one. Called every frame (one transform + a few opacity sets).
  function syncWorld() {
    if (!worldInner) return;
    // the world DOM layer rides the exact same transform as the canvas. Nothing
    // is hidden by zoom — everything just scales. The only modulation is the
    // per-token wave brightening each lens chip as it sweeps past (never hides).
    worldInner.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
    for (let i = 0; i < lensEls.length; i++) {
      if (!lensData) { lensEls[i].el.style.opacity = '0'; continue; }
      const passed = waveFront === Infinity ? 1 : clamp((waveFront - slotX(i * 8)) / (CX * 0.8) + 0.5, 0, 1);
      lensEls[i].el.style.opacity = (0.55 + 0.45 * passed).toFixed(3);
    }
  }

  // Re-measure the screen positions of the text-strip tokens (called after the
  // strip's content/size changes). Centers are stored relative to #io so the arc
  // overlay canvas, which covers #io, can draw straight to them.
  function updateArcs() {
    if (!arcsCanvas || !stripEl || !ioEl) return;
    const base = ioEl.getBoundingClientRect();
    arcsCanvas.width = Math.round(base.width * dpr);
    arcsCanvas.height = Math.round(base.height * dpr);
    arcsCanvas.style.width = `${base.width}px`;
    arcsCanvas.style.height = `${base.height}px`;
    arcCenters = []; arcOrigin = null; arcBaseY = 0;
    for (const sp of stripEl.querySelectorAll('span')) {
      const b = sp.getBoundingClientRect();
      const c = { x: b.left + b.width / 2 - base.left, y: b.bottom - base.top };
      if (c.y > arcBaseY) arcBaseY = c.y;
      if (sp.hasAttribute('data-origin')) arcOrigin = c;
      const w = sp.getAttribute('data-w');
      if (w !== null) arcCenters[+w] = c;
    }
    arcBaseY += 3;
  }

  // Attention arcs on the real words: from the just-produced token back to the
  // window tokens its query attended to (final layer, one arc per head·target;
  // color = head, thickness/opacity ∝ weight). Drawn in the padding lane below
  // the text. The per-block heat strips still cover the other layers.
  function drawTopArcs() {
    if (!arcsCtx) return;
    arcsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    arcsCtx.clearRect(0, 0, arcsCanvas.width / dpr, arcsCanvas.height / dpr);
    if (!attnData || !arcOrigin || !arcCenters.length) return;
    const layer = attnData[ARC_LAYER];
    if (!layer) return;
    // ramp arcs in as the step computes, with a floor so they never fully blink out
    const reveal = 0.45 + 0.55 * (waveActive ? clamp((nowT - waveStart) / waveDuration, 0, 1) : 1);
    const ox = arcOrigin.x, oy = arcBaseY;
    for (let h = 0; h < H; h++) {
      const arow = layer[h] && layer[h][attnLastPos];
      if (!arow) continue;
      let rmax = 1e-6;
      for (let k = 0; k < arcCenters.length; k++) if (arcCenters[k] && arow[k] > rmax) rmax = arow[k];
      const cand = [];
      for (let k = 0; k < arcCenters.length; k++) {
        if (!arcCenters[k] || k === attnLastPos) continue;
        const wgt = (arow[k] || 0) / rmax;
        if (wgt >= 0.12) cand.push({ k, wgt });
      }
      cand.sort((p, q) => q.wgt - p.wgt);
      for (let c = 0; c < cand.length && c < 6; c++) {
        const t = arcCenters[cand[c].k], wgt = cand[c].wgt;
        const dip = oy + 8 + Math.min(26, Math.abs(ox - t.x) * 0.14);
        arcsCtx.beginPath();
        arcsCtx.moveTo(ox, oy);
        arcsCtx.quadraticCurveTo((ox + t.x) / 2, dip, t.x, oy);
        arcsCtx.lineWidth = 0.6 + 2.4 * wgt;
        arcsCtx.strokeStyle = rgba(headColors[h], (0.12 + 0.6 * wgt) * reveal);
        arcsCtx.stroke();
      }
    }
  }

  // Small, unintrusive key (bottom-left, screen space): node activation colormap,
  // edge sign colors, and the per-head attention swatches.
  function drawLegend() {
    const w = 138, h = 80, x = 16, y = cssH - h - 16;
    ctx.fillStyle = 'rgba(12,10,8,0.6)';
    roundRectScreen(x, y, w, h, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(150,135,105,0.26)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '10px ui-monospace, monospace';

    // node activation gradient (− blue · 0 dark · + orange)
    ctx.fillStyle = 'rgba(210,198,176,0.92)';
    ctx.fillText('node activation', x + 10, y + 13);
    const bx = x + 10, by = y + 22, bw = w - 38, bh = 8, steps = 36;
    for (let i = 0; i < steps; i++) {
      ctx.fillStyle = rgba(divColor((i / (steps - 1)) * 2 - 1, 1), 1);
      ctx.fillRect(bx + i * (bw / steps), by, bw / steps + 1, bh);
    }
    ctx.fillStyle = 'rgba(180,170,150,0.85)';
    ctx.fillText('−', bx + bw + 4, by + bh / 2 - 4); ctx.fillText('+', bx + bw + 4, by + bh / 2 + 4);

    // edge sign swatches
    const ey = y + 44;
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(C_EPOS, 0.95); ctx.beginPath(); ctx.moveTo(x + 10, ey); ctx.lineTo(x + 26, ey); ctx.stroke();
    ctx.fillStyle = 'rgba(200,190,170,0.88)'; ctx.fillText('+weight', x + 30, ey);
    const ey2 = y + 60;
    ctx.strokeStyle = rgba(C_ENEG, 0.95); ctx.beginPath(); ctx.moveTo(x + 10, ey2); ctx.lineTo(x + 26, ey2); ctx.stroke();
    ctx.fillText('−weight', x + 30, ey2);

    // attention head swatches
    ctx.fillText('heads', x + 84, ey);
    let hx = x + 84;
    for (let hh = 0; hh < H; hh++) { ctx.fillStyle = rgba(headColors[hh], 0.95); ctx.fillRect(hx, ey2 - 4, 9, 9); hx += 12; }
  }

  // canvas path helpers (current transform)
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function roundRectScreen(x, y, w, h, r) { roundRect(x, y, w, h, r); }

  // ----------------------------------------------------------------- API -----
  let raf = 0;
  function start() {
    resize(); resetView();
    buildLensChips();
    buildWorldLabels();
    buildDescriptions();
    buildAttnDom();
    buildOutputDom();
    if (!raf) raf = requestAnimationFrame(frame);
    if (window.ResizeObserver) {
      new ResizeObserver(() => { resize(); updateArcs(); }).observe(canvas);
    } else {
      window.addEventListener('resize', () => { resize(); updateArcs(); });
    }
  }

  return { start, pushStep, reset, resetView, setSpeed, resize, updateArcs, view, worldBounds };
}
