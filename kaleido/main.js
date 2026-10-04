// Kaleido roaster UI. The server (kaleido/server/main.js) does all the
// roasting; this page shows what's happening, speaks, and sends the person's
// actions back over the WebSocket.

import {createCharts} from './ui/charts.js';
import {say, chime, unlock} from './ui/sound.js';
import {listen, clusters} from './ui/pops.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const f = (v, d = 0) => (v == null ? '–' : Number(v).toFixed(d));

let state = null;
let samples = [];
let procedures = [];
const references = {}; // roast number → curve (or a pending promise)
let ws = null;
let mic = null; // {stop, pops: [ms], level}
let confirmDone = false;

// ---- server connection

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = ({data}) => handle(JSON.parse(data));
  ws.onclose = () => {
    $('conn').textContent = 'server not running';
    $('conn').className = 'label down';
    setTimeout(connect, 1000);
  };
}

function act(action, args = {}) {
  ws?.send(JSON.stringify({type: 'action', action, args}));
}

function handle(msg) {
  if (msg.type === 'state') {
    state = msg.state;
    renderAll();
  } else if (msg.type === 'history') {
    samples = msg.samples;
    scheduleChart();
  } else if (msg.type === 'sample') {
    samples.push(msg.sample);
    const cutoff = msg.sample.t - 3 * 3600_000;
    while (samples.length && samples[0].t < cutoff) samples.shift();
    renderReadouts(msg.sample);
    renderLive(msg.sample);
    scheduleChart();
  } else if (msg.type === 'say') {
    if (msg.urgent) chime('alarm');
    say(msg.text, msg.urgent);
  } else if (msg.type === 'chime') {
    chime(msg.kind);
  } else if (msg.type === 'error') {
    toast(msg.message);
  }
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'on';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 4000);
}

// ---- top bar

const PHASES = {
  IDLE: 'Not started',
  NEW: 'Starting',
  PREHEAT: 'Preheating',
  READY: 'Ready for charge',
  ROASTING: 'Roasting',
  SHUTDOWN: 'Cooling down',
  OFF: 'All off',
};

function renderReadouts(s) {
  $('bt').textContent = s ? `${f(s.BT, 1)}°` : '–';
  $('et').textContent = s ? `${f(s.ET, 1)}°` : '–';
  $('ror').textContent = s?.ror != null ? `${f(s.ror, 1)}°/m` : '–';
  $('burner').textContent = s ? `${f(s.HP)}%` : '–';
  $('air').textContent = s ? `${f(s.FC)}%` : '–';
  const b = state?.batch;
  const end = b?.drop?.t ?? s?.t;
  $('timer').textContent = b?.charge && end ? mmss(end - b.charge.t) : '–';
}

function renderBar() {
  const conn = $('conn');
  if (!state) return;
  conn.textContent =
    (state.connected ? 'roaster connected' : 'ROASTER NOT CONNECTED') +
    (state.mode === 'sim' ? ' (simulator)' : '');
  conn.className = state.connected ? 'label' : 'label down';
  $('phaseText').textContent = PHASES[state.phase] ?? state.phase;
  const b = state.batch;
  $('alarm').className = b?.drop && !b.beansOut ? 'on' : '';
}

// ---- side panel

// Only rebuilt when something it shows changes, so typing in it isn't
// interrupted by the readings arriving every 1.5 s.
let sideKey = '';
function renderSide() {
  const s = state;
  const key = JSON.stringify([
    s.phase,
    s.mode,
    s.next,
    s.batch && [s.batch.number, s.batch.fc, s.batch.sc, s.batch.drop],
    s.batch && [s.batch.beansOut, s.batch.steps.length],
    s.planned,
    s.overrides,
    s.cooling,
    s.doneRequested,
    s.lastBatch,
    s.alerts,
    procedures.length,
    !!mic,
    confirmDone,
  ]);
  if (key === sideKey) return;
  sideKey = key;
  $('side').innerHTML = [
    statusSection(),
    roastSection(),
    stepsSection(),
    nextSection(),
    coolingSection(),
    weightOutSection(),
    alertsSection(),
    simSection(),
    micSection(),
    doneSection(),
  ]
    .filter(Boolean)
    .join('');
}

const section = (title, body) =>
  `<section>${title ? `<h2>${title}</h2>` : ''}${body}</section>`;

function statusSection() {
  const {phase, next} = state;
  if (phase === 'IDLE' || phase === 'OFF')
    return section(
      '',
      `<p class="note">${phase === 'OFF' ? 'All off. ' : ''}Preheating takes 15–18 minutes from cold.</p>
       <button class="big primary" data-act="startSession">Start preheating</button>`,
    );
  if (phase === 'PREHEAT')
    return section(
      'Preheat',
      `<div class="note" id="preheatInfo">Waiting for BT to hold steady…</div>`,
    );
  if (phase === 'READY')
    return section(
      '',
      next
        ? `<div class="ready">Ready for charge: pour in the beans.</div>
           <p class="note">The roast starts by itself when BT drops.</p>`
        : `<div class="ready">Ready. Choose the beans below.</div>`,
    );
  if (phase === 'SHUTDOWN')
    return section(
      'Shutting down',
      `<p class="note">Heater off; air and drum run until BT is under 60 °C, then everything turns off.</p>`,
    );
  return '';
}

function roastSection() {
  const b = state.batch;
  if (state.phase !== 'ROASTING' || !b) return '';
  const variant = b.variant ? ` (${esc(b.variant)})` : '';
  const ctrl = (name, key, label) => {
    const value = state.overrides[key] ?? state.planned[key];
    const manual = key in state.overrides;
    return `<div class="control">
      <span>${label}</span>
      <span class="pct">${f(value)}%</span>
      <span class="row">
        <button data-act="nudge" data-control="${name}" data-delta="-5">−5</button>
        <button data-act="nudge" data-control="${name}" data-delta="5">+5</button>
        ${manual ? `<span class="tag">manual</span><button data-act="release" data-control="${name}">Back to procedure</button>` : ''}
      </span>
    </div>`;
  };
  return section(
    `#${b.number} ${esc(b.beanName)}${variant}, ${f(b.weightIn)} g`,
    `<div class="row" style="flex-direction: column; align-items: stretch">
       <button class="big" data-act="markFC" ${b.fc ? 'disabled' : ''}>
         ${b.fc ? `First crack at ${mmss(b.fc.t - b.charge.t)}` : 'First crack'}</button>
       <div class="note" id="devInfo"></div>
       <button class="big" data-act="markSC">Second crack (drops now)</button>
       <button data-act="dropNow">Drop now</button>
     </div>
     <div style="margin-top: 10px">
       ${ctrl('burner', 'HP', 'Burner')}
       ${ctrl('air', 'FC', 'Air')}
     </div>`,
  );
}

const what = (s) =>
  [s.burner != null && `burner ${s.burner}%`, s.air != null && `air ${s.air}%`]
    .filter(Boolean)
    .join(', ');
const beanName = (slug) =>
  procedures.find((p) => p.bean === slug)?.name ?? slug;

function stepsSection() {
  const b = state.batch;
  const proc = b?.proc ?? state.next?.proc;
  if (!proc) return '';
  const fired = new Map((b?.steps ?? []).map((s) => [s.index, s]));
  const at = (t) => (b?.charge ? mmss(t - b.charge.t) : '');
  let nextShown = false;
  const rows = (proc.steps ?? []).map((s, i) => {
    const done = fired.get(i);
    let cls = done ? 'done' : '';
    if (!done && b && !nextShown) {
      cls = 'next';
      nextShown = true;
    }
    return `<tr class="${cls}"><td>${s.bt}°</td><td>${what(s)}</td><td>${done ? `✓ ${at(done.t)}` : ''}</td></tr>`;
  });
  const dropDone = b?.drop;
  const dropCls = dropDone ? 'done' : b && !nextShown ? 'next' : '';
  const ref = proc.reference
    ? `<p class="note">Dashed line: roast #${proc.reference.roast} (FC ${proc.reference.fc}, drop ${proc.reference.drop}).</p>`
    : '';
  return section(
    b
      ? 'Procedure'
      : `Procedure: ${esc(beanName(state.next.bean))} (${esc(proc.variant)})`,
    `<table class="steps">
       <tr class="${b ? 'done' : ''}"><td>charge</td><td>burner ${proc.charge.burner}%, SV ${proc.charge.sv}</td><td>${b ? '✓ 0:00' : ''}</td></tr>
       ${rows.join('')}
       <tr class="${dropCls}"><td>${proc.drop.bt}°</td><td>drop</td><td id="dropEta">${dropDone ? `✓ ${at(dropDone.t)}` : ''}</td></tr>
     </table>${ref}${proc.notes ? `<p class="note">${esc(proc.notes)}</p>` : ''}`,
  );
}

function nextSection() {
  const {phase, next} = state;
  if (!['PREHEAT', 'READY', 'ROASTING'].includes(phase)) return '';
  if (next && !nextSection.editing)
    return section(
      phase === 'ROASTING' ? 'Next batch' : 'Beans',
      `<div class="row">${esc(beanName(next.bean))} (${esc(next.variant)}), ${f(next.weightIn)} g
         <button data-act="editNext">Change</button></div>`,
    );
  const options = procedures
    .map((p) => `<option value="${esc(p.bean)}">${esc(p.name)}</option>`)
    .join('');
  return section(
    phase === 'ROASTING' ? 'Next batch' : 'Beans',
    `<div class="row">
       <select id="bean">${options}</select>
       <select id="variant"></select>
     </div>
     <div class="row" style="margin-top: 6px">
       <label>Weight in <input id="weightIn" type="number" min="50" max="250" step="0.1"> g</label>
       <button class="primary" data-act="selectBatch">Set</button>
     </div>`,
  );
}

function coolingSection() {
  if (!state.cooling) return '';
  return section(
    'Cooling fan',
    `<div class="row">On <button data-act="coolingOff">Turn off</button></div>`,
  );
}

function weightOutSection() {
  const last = state.lastBatch;
  if (!last) return '';
  if (last.weightOut != null) {
    const loss = last.weightIn
      ? ` (${f(((last.weightIn - last.weightOut) / last.weightIn) * 100, 1)}% loss)`
      : '';
    return section(
      `Roast #${last.number}`,
      `<p class="note">${f(last.weightIn)} g → ${f(last.weightOut, 1)} g${loss}</p>`,
    );
  }
  return section(
    `Roast #${last.number}: weight out`,
    `<div class="row"><input id="weightOut" type="number" min="0" step="0.1"> g
       <button class="primary" data-act="saveWeightOut" data-number="${last.number}">Save</button></div>`,
  );
}

function alertsSection() {
  if (!state.alerts.length) return '';
  const icon = {urgent: '⚠', warn: '!', info: 'i'};
  return section(
    'Alerts',
    state.alerts
      .slice()
      .reverse()
      .map(
        (a) =>
          `<div class="alert ${a.level}"><span class="icon">${icon[a.level] ?? 'i'} ${a.level === 'urgent' ? 'Urgent' : 'Warning'}</span><span>${esc(a.text)}</span></div>`,
      )
      .join(''),
  );
}

function simSection() {
  if (state.mode !== 'sim') return '';
  return section(
    'Simulator',
    `<div class="row">
       <button data-act="simCharge">Pour beans in</button>
       <button data-act="simDischarge">Open the door</button>
     </div>`,
  );
}

function micSection() {
  return section(
    'Crack listening',
    mic
      ? `<div class="row">Listening <span class="note" id="micInfo"></span>
           <button data-act="micOff">Stop</button></div>`
      : `<div class="row"><button data-act="micOn">Listen for cracks</button>
           <span class="note">Hints only; you still press the buttons.</span></div>`,
  );
}

function doneSection() {
  const {phase, doneRequested} = state;
  if (!['PREHEAT', 'READY', 'ROASTING'].includes(phase)) return '';
  if (doneRequested)
    return section('', `<p class="note">Shutting down after this batch.</p>`);
  const label =
    phase === 'ROASTING' ? 'Shut down after this batch' : 'Done for today';
  return section(
    '',
    `<button data-act="done">${confirmDone ? 'Click again to confirm' : label}</button>`,
  );
}

// Fill in the variant list for the chosen bean.
function syncVariants() {
  const bean = $('bean');
  if (!bean) return;
  const p = procedures.find((x) => x.bean === bean.value);
  $('variant').innerHTML = (p?.variants ?? [])
    .map((v) => `<option>${esc(v)}</option>`)
    .join('');
  $('variant').style.display = p?.variants.length ? '' : 'none';
  if (p?.batchGrams && !$('weightIn').value) $('weightIn').value = p.batchGrams;
}

const HANDLERS = {
  startSession: () => act('startSession'),
  markFC: () => act('markFC'),
  markSC: () => act('markSC'),
  dropNow: () => act('dropNow'),
  coolingOff: () => act('setCooling', {on: false}),
  simCharge: () => act('simCharge'),
  simDischarge: () => act('simDischarge'),
  release: (el) => act('release', {control: el.dataset.control}),
  nudge: (el) => {
    const key = el.dataset.control === 'burner' ? 'HP' : 'FC';
    const now = state.overrides[key] ?? state.planned[key] ?? 0;
    const value = Math.max(0, Math.min(100, now + Number(el.dataset.delta)));
    act('override', {control: el.dataset.control, value});
  },
  editNext: () => {
    nextSection.editing = true;
    sideKey = '';
    renderSide();
    syncVariants();
  },
  selectBatch: () => {
    const weightIn = Number($('weightIn').value);
    if (!(weightIn > 0)) return toast('Enter the weight in grams.');
    nextSection.editing = false;
    act('selectBatch', {
      bean: $('bean').value,
      variant: $('variant').value || null,
      weightIn,
    });
  },
  saveWeightOut: (el) => {
    const grams = Number($('weightOut').value);
    if (!(grams > 0)) return toast('Enter the weight in grams.');
    act('setWeightOut', {number: Number(el.dataset.number), grams});
  },
  done: () => {
    if (!confirmDone) {
      confirmDone = true;
      setTimeout(() => {
        confirmDone = false;
        renderSide();
      }, 4000);
    } else {
      confirmDone = false;
      act('done');
    }
    renderSide();
  },
  micOn: async () => {
    const pops = [];
    try {
      const stop = await listen({
        onPop: (intensity) => {
          pops.push(Date.now());
          act('pop', {intensity});
          renderHint();
        },
        onLevel: (level) => {
          const el = $('micInfo');
          if (el) el.textContent = `(background ${(level * 1000).toFixed(1)})`;
        },
      });
      mic = {stop, pops};
    } catch (err) {
      toast(`Microphone: ${err.message}`);
    }
    renderSide();
  },
  micOff: () => {
    mic?.stop();
    mic = null;
    renderSide();
  },
};

$('side').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el) HANDLERS[el.dataset.act]?.(el);
});
$('side').addEventListener('change', (e) => {
  if (e.target.id === 'bean') {
    $('weightIn').value = '';
    syncVariants();
  }
});
$('beansOut').onclick = () => act('beansOut');

// ---- live numbers inside the side panel (updated every reading)

function renderLive(s) {
  if (!state) return;
  const b = state.batch;
  const pre = $('preheatInfo');
  if (pre) pre.textContent = preheatProgress();
  const dev = $('devInfo');
  if (dev && b?.fc) {
    const since = s.t - b.fc.t;
    const total = s.t - b.charge.t;
    dev.textContent = `Development ${mmss(since)} (${f((since / total) * 100)}% of the roast)`;
  }
  const eta = $('dropEta');
  if (eta && b && !b.drop && s.ror > 0.5 && b.tp) {
    const secs = ((b.proc.drop.bt - s.BT) / s.ror) * 60;
    eta.textContent = secs < 900 ? `in ~${mmss(secs * 1000)}` : '';
  }
  renderHint();
}

// How close preheat is to "ready" (the server decides; this just shows it):
// how long BT has held near 185, and whether ET is still rising.
function preheatProgress() {
  const last = samples.at(-1);
  if (!last) return '';
  let i = samples.length - 1;
  while (i > 0 && Math.abs(samples[i - 1].BT - 185) <= 1.5) i--;
  const held = Math.abs(last.BT - 185) <= 1.5 ? last.t - samples[i].t : 0;
  const recent = samples.filter((x) => last.t - x.t <= 180_000);
  const etRise = slope(recent, 'ET');
  const et =
    etRise == null
      ? ''
      : etRise > 0.5
        ? ` · ET still rising ${f(etRise, 1)}°/min (drum soaking up heat)`
        : ' · ET steady';
  return `BT ${f(last.BT, 1)}°, steady for ${mmss(Math.min(held, 180_000))} of 3:00${et}`;
}

function slope(xs, key) {
  if (xs.length < 3) return null;
  const t0 = xs[0].t;
  const n = xs.length;
  let st = 0,
    sv = 0,
    stt = 0,
    stv = 0;
  for (const x of xs) {
    const t = (x.t - t0) / 60_000;
    st += t;
    sv += x[key];
    stt += t * t;
    stv += t * x[key];
  }
  const d = n * stt - st * st;
  return d ? (n * stv - st * sv) / d : null;
}

function renderHint() {
  const el = $('hint');
  const b = state?.batch;
  const last = samples.at(-1);
  let text = '';
  if (mic && b && !b.drop && last && clusters(mic.pops, Date.now())) {
    if (!b.fc && last.BT > 170)
      text =
        '🔊 Pops: first crack? Press First crack if you hear several close together.';
    else if (b.fc && !b.sc && last.BT > b.fc.BT + 8)
      text = '🔊 Pops: second crack? Press Second crack to drop now.';
  }
  el.textContent = text;
  el.className = text ? 'on' : '';
}

// ---- charts

let charts = null;
let chartQueued = false;
function scheduleChart() {
  if (chartQueued) return;
  chartQueued = true;
  requestAnimationFrame(() => {
    chartQueued = false;
    renderChart();
  });
}

function reference(proc) {
  const n = proc?.reference?.roast;
  if (n == null) return null;
  if (!(n in references)) {
    references[n] = null;
    fetch(`/api/roast/${n}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((curve) => {
        references[n] = curve;
        scheduleChart();
      });
  }
  return references[n];
}

function renderChart() {
  if (!state || !samples.length) return;
  charts ??= createCharts($('charts'));
  const b = state.batch;
  const last = samples.at(-1);
  const zero = b?.charge ? b.charge.t : last.t; // x = seconds from here
  const x = samples.map((s) => (s.t - zero) / 1000);
  const ref = reference(b?.proc ?? state.next?.proc);
  let range;
  if (b?.charge) {
    const end = Math.max(600, (ref?.drop?.t ?? 0) + 60, x.at(-1) + 60);
    range = [-60, end];
  } else range = [-20 * 60, 0];

  const markers = [];
  const guides = [];
  if (b?.charge) {
    const rel = (m) => (m.t - zero) / 1000;
    markers.push({x: 0, label: 'charge', strong: true});
    if (b.tp) markers.push({x: rel(b.tp), label: `TP ${f(b.tp.BT)}°`});
    for (const s of b.steps)
      markers.push({x: rel(s), label: s.burner != null ? `${s.burner}%` : ''});
    if (b.fc) markers.push({x: rel(b.fc), label: 'FC', strong: true});
    if (b.sc) markers.push({x: rel(b.sc), label: 'SC', strong: true});
    if (b.drop) markers.push({x: rel(b.drop), label: 'drop', strong: true});
    // Just the next step: guides for all of them crowd into each other.
    const firedIdx = new Set(b.steps.map((s) => s.index));
    const next = b.drop ? null : b.proc.steps.find((s, i) => !firedIdx.has(i));
    if (next)
      guides.push({y: next.bt, label: `next: ${what(next)} at ${next.bt}°`});
    if (!b.drop)
      guides.push({
        y: b.proc.drop.bt,
        label: `drop ${b.proc.drop.bt}°`,
        strong: true,
      });
  } else if (state.phase === 'PREHEAT' || state.phase === 'READY')
    guides.push({y: 185, label: 'preheat 185°'});
  const pops = (b?.charge && mic ? mic.pops : []).map(
    (t) => (t - Date.now() + last.t - zero) / 1000,
  );

  charts.update(
    {
      x,
      BT: samples.map((s) => s.BT ?? null),
      ET: samples.map((s) => s.ET ?? null),
      ror: samples.map((s) =>
        b?.charge && s.t < (b.tp?.t ?? Infinity) ? null : (s.ror ?? null),
      ),
      HP: samples.map((s) => s.HP ?? null),
      FC: samples.map((s) => s.FC ?? null),
    },
    ref && {x: ref.t, BT: ref.BT},
    range,
    {markers, guides, pops},
  );
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  charts?.destroy();
  charts = null;
  $('charts').innerHTML = '';
  scheduleChart();
});

// ---- render everything

function renderAll() {
  renderBar();
  renderSide();
  syncVariantsIfFresh();
  renderReadouts(samples.at(-1));
  if (samples.length) renderLive(samples.at(-1));
  scheduleChart();
}

// The bean form was just (re)built: fill its variant list.
function syncVariantsIfFresh() {
  const v = $('variant');
  if (v && !v.options.length) syncVariants();
}

// ---- start

$('start').querySelector('button').onclick = () => {
  unlock();
  $('start').remove();
};
fetch('/api/procedures')
  .then((r) => r.json())
  .then((list) => {
    procedures = list;
    if (state) renderAll();
  });
connect();
