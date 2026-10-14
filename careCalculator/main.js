import {
  example,
  child,
  childName,
  calculate,
  scenarios,
  sanitize,
  WEIGHTS,
  MODEL_VERSION,
  MAX_CHILDREN,
} from './model.js';
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[
        c
      ],
  );
const money = (v) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.round(v * 100) / 100 || 0);
const STORAGE_KEY = 'care-v5';
const signed = (v) => (v > 0.005 ? '+' : '') + money(v);
// The plan also lives in the URL hash, so a link reproduces it. Links carry
// the full weights, so retuning the defaults never changes an old link.
function encode(st) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({...st, v: MODEL_VERSION}),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function decode(hash) {
  const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
// Links and saves are untrusted: sanitize() rebuilds them from known fields,
// so nothing from them reaches innerHTML except plain values.
function loadState() {
  try {
    const linked =
      location.hash.length > 1 && sanitize(decode(location.hash.slice(1)));
    if (linked) return linked;
  } catch {
    // A mangled link falls through to this device's plan.
  }
  try {
    const saved = sanitize(
      JSON.parse(localStorage.getItem(STORAGE_KEY))?.state,
    );
    if (saved) return saved;
  } catch {
    // Ignore unreadable saves and start from the example.
  }
  return example();
}
let state = loadState();
// Snapshots taken before buttons that replace or remove things.
const undoStack = [];
function remember() {
  undoStack.push(structuredClone(state));
  if (undoStack.length > 30) undoStack.shift();
}
const num = (title, key, value, min, max, step = 1, idx = '') =>
  `<label>${title}<input type="number" data-key="${key}" data-index="${idx}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
const select = (title, key, value, options, idx = '', hidden = false) =>
  `<label ${hidden ? 'hidden' : ''}>${title}<select data-key="${key}" data-index="${idx}">${options.map(([v, t]) => `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
const TASKS = [
  ['diapers', 'Diapers & potty'],
  ['feeding', 'Meal / bottles'],
  ['bath', 'Bathing'],
  ['bed', 'Bedtime'],
];
const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;
// Age as years + months; the months box rolls over into years.
const ageField = (c, i) =>
  `<label>Age<span class="age-input"><input type="number" aria-label="${esc(childName(c, i))}, age in years" data-key="years" data-index="${i}" value="${Math.floor(c.months / 12)}" min="0" max="18" step="1"><span>yr</span><input type="number" aria-label="${esc(childName(c, i))}, months" data-key="mo" data-index="${i}" value="${+(c.months % 12).toFixed(2)}" min="0" max="216" step="0.25"><span>mo</span></span></label>`;
const pct = (v) => Math.round(v * 100) + '%';
// "0 mo: 0.35, 12 mo: 0.3, …" for an age-anchor list.
const anchors = (list) =>
  list.map((a) => `${a.months} mo: ${a.value}`).join(', ');
// Each child keeps its color slot when others are removed, so colors follow
// the child rather than its position. Past eight, children share a gray.
const HUES = 8;
function assignHues() {
  const used = new Set(state.children.map((c) => c.hue));
  for (const c of state.children) {
    if (c.hue !== undefined) continue;
    c.hue = [...Array(HUES).keys()].find((h) => !used.has(h)) ?? HUES;
    used.add(c.hue);
  }
}
const hueVar = (c) =>
  `--hue: var(--series-${c && c.hue < HUES ? c.hue + 1 : 'other'})`;
// Each caregiver's share of the workload, stacked by child, measured against
// the reference session: base pay covers 1×, the heavy-load line is at
// weights.heavyLoad×.
function meter(r) {
  const w = state.weights;
  const n = state.caregivers;
  const rel = (v) => v / w.included;
  const load = rel(r.load);
  const max = Math.max(w.heavyLoad * 1.15, load * 1.05);
  const at = (v) => (Math.min(v, max) / max) * 100 + '%';
  const segs = r.rows.map((row, i) => [
    row.name,
    rel(row.total / n),
    hueVar(state.children[i]),
  ]);
  if (r.group + r.environment > 0)
    segs.push([
      'Group & setting',
      rel((r.group + r.environment) / n),
      hueVar(),
    ]);
  const [cls, icon, label] =
    load <= 1 + 1e-9
      ? ['good', '✓', 'Covered by base pay']
      : load <= w.heavyLoad
        ? ['warning', '+', 'Premium applies']
        : ['critical', '!', 'Heavy'];
  return `<div class="load"><div class="load-head"><span>Workload per caregiver</span><span class="status ${cls}"><i aria-hidden="true">${icon}</i>${label}</span></div><div class="meter" role="img" aria-label="Each caregiver carries ${load.toFixed(2)} times the reference session’s load"><div class="fill" style="width:${at(load)}">${segs
    .filter(([, v]) => v > 0.0005)
    .map(
      ([name, v, hue]) =>
        `<span class="seg" style="flex-grow:${v};${hue}" data-tip="${esc(name)}: ${v.toFixed(2)}× per caregiver"></span>`,
    )
    .join(
      '',
    )}</div><span class="mark" style="left:${at(1)}"></span><span class="mark heavy" style="left:${at(w.heavyLoad)}"></span></div><div class="scale"><span style="left:${at(1)}">Reference</span><span style="left:${at(w.heavyLoad)}">Heavy ${w.heavyLoad}×</span></div><div class="legend">${segs
    .map(
      ([name, , hue]) =>
        `<span style="${hue}"><i class="dot"></i>${esc(name)}</span>`,
    )
    .join('')}</div></div>`;
}
// The weights panel is optional, so lil-gui loads on the side: if the CDN is
// unreachable, the calculator still works and the panel says why it's absent.
let GUI;
let gui;
import('https://cdn.jsdelivr.net/npm/lil-gui@0.21/+esm')
  .then((m) => {
    GUI = m.default;
    buildGui();
  })
  .catch(() => {
    $('weights').innerHTML =
      '<p class="hint">The weights panel couldn’t load (it needs the lil-gui library from the internet).</p>';
  });
function buildGui() {
  if (!GUI) return;
  gui?.destroy();
  const w = state.weights;
  gui = new GUI({container: $('weights'), title: 'Weights'});
  gui.add(w, 'premium', 0, 60, 0.5).name('Premium ($/hr per point)');
  gui.add(w, 'soloBonus', 0, 15, 0.5).name('Sole caregiver ($/hr)');
  gui.add(w, 'included', 0.1, 1.5, 0.001).name('Included pts / caregiver');
  gui.add(w, 'heavyLoad', 1, 3, 0.05).name('Heavy-load warning (×)');
  const sup = gui.addFolder('Supervision by age (pts)').close();
  for (const a of w.supervision)
    sup.add(a, 'value', 0, 1, 0.01).name(`${a.months} mo`);
  sup.add(w, 'asleepSupervision', 0, 1, 0.05).name('Kept while asleep');
  sup.add(w, 'soleResponsibility', 0, 1, 0.05).name('Parents away (+share)');
  const care = gui.addFolder('Attention & settling (pts)').close();
  for (const k of ['occasional', 'frequent', 'constant'])
    care.add(w.attention, k, 0, 1, 0.01).name(`Attention: ${k}`);
  care.add(w.settling, 'holding', 0, 1, 0.05).name('Settling: holding');
  care.add(w.settling, 'active', 0, 1, 0.05).name('Settling: active');
  const tasks = gui.addFolder('Tasks (minutes)').close();
  tasks.add(w.away, 'team', 0, 4, 0.05).name('Away factor, team');
  tasks.add(w.away, 'solo', 0, 4, 0.05).name('Away factor, alone');
  tasks.add(w, 'inRoom', 0, 2, 0.05).name('In-room factor');
  tasks.add(w.toiletingPerHour, 'diaper', 0, 30, 1).name('Diapers, min/hr');
  tasks.add(w.toiletingPerHour, 'help', 0, 30, 1).name('Potty help, min/hr');
  for (const a of w.feedingMinutes)
    tasks.add(a, 'value', 0, 60, 1).name(`Meal, ${a.months} mo`);
  tasks.add(w, 'allergyMinutes', 0, 60, 1).name('Food precautions / meal');
  tasks.add(w, 'bathMinutes', 0, 60, 1).name('Bath');
  for (const a of w.bedMinutes)
    tasks.add(a, 'value', 0, 60, 1).name(`Bedtime, ${a.months} mo`);
  const group = gui.addFolder('Group & space').close();
  group.add(w.play, 'led', 0, 0.5, 0.01).name('Adult-led, pts / child');
  group.add(w.play, 'conflict', 0, 0.5, 0.01).name('Mediation, pts / child');
  group.add(w, 'splitSpace', 0, 1, 0.05).name('Divided sightlines (+share)');
  const staff = gui.addFolder('Staffing warnings').close();
  staff
    .add(w, 'maxChildrenPerCaregiver', 1, 10, 1)
    .name('Children / caregiver');
  staff.add(w, 'maxUnder2PerCaregiver', 1, 6, 1).name('Under-2s / caregiver');
  gui
    .add(
      {
        restore: () => {
          state.weights = structuredClone(WEIGHTS);
          buildGui();
          updateResult();
        },
      },
      'restore',
    )
    .name('Restore default weights');
  gui.onChange(updateResult);
}
function render() {
  assignHues();
  $('add').disabled = state.children.length >= MAX_CHILDREN;
  $('add').title = $('add').disabled ? `Up to ${MAX_CHILDREN} children` : '';
  $('session').innerHTML =
    num('Hours', 'hours', state.hours, 0.5, 12, 0.5) +
    num('Caregivers', 'caregivers', state.caregivers, 1, 6) +
    num('Base pay / person / hour ($)', 'base', state.base, 0, 150, 0.5) +
    select('Parents available?', 'parents', state.parents, [
      ['true', 'On site, ready to help'],
      ['false', 'Away / unavailable'],
    ]);
  renderChildren();
  $('tasks').innerHTML = TASKS.map(
    ([k, t]) =>
      `<label class="task"><input type="checkbox" data-key="${k}" ${state[k] ? 'checked' : ''}>${t}</label>`,
  ).join('');
  $('setting').innerHTML =
    select('Play space', 'space', state.space, [
      ['shared', 'One suitable, visible area'],
      ['split', 'Suitable areas, divided sightlines'],
    ]) +
    select('Group play', 'play', state.play, [
      ['together', 'They entertain themselves'],
      ['led', 'Adults lead activities'],
      ['conflict', 'Frequent mediation'],
    ]);
  buildGui();
  updateResult();
}
function renderChildren() {
  $('children').innerHTML = state.children
    .map(
      (c, i) =>
        `<article class="child" role="group" aria-label="${esc(childName(c, i))}" style="${hueVar(c)}"><div class="child-top"><input class="name" aria-label="Child ${i + 1} name" data-key="name" data-index="${i}" value="${esc(c.name)}" maxlength="40"><button class="remove" data-remove="${i}" aria-label="Remove ${esc(childName(c, i))}">×</button></div><div class="child-body"><div class="fields">${ageField(c, i)}${select(
          'Extra attention during play',
          'attention',
          c.attention,
          [
            ['none', 'Mostly independent'],
            ['occasional', 'Occasional redirection'],
            ['frequent', 'Frequent involvement'],
            ['constant', 'Nearly constant help'],
          ],
          i,
        )}${select(
          'Help settling',
          'settle',
          c.settle,
          [
            [0, 'None'],
            [10, 'About 10 minutes'],
            [30, 'About 30 minutes'],
            [60, 'About an hour'],
            [999, 'Whole session'],
          ],
          i,
        )}${select(
          'Settling takes',
          'comfort',
          c.comfort,
          [
            ['holding', 'Holding, still watching others'],
            ['active', 'One-to-one, full attention'],
          ],
          i,
          !c.settle,
        )}${num('Expected time asleep (%)', 'sleep', c.sleep, 0, 100, 5, i)}${select(
          'Toileting needs',
          'toilet',
          c.toilet,
          [
            ['diaper', 'Diapers'],
            ['help', 'Potty assistance'],
            ['independent', 'Independent'],
          ],
          i,
          !state.diapers,
        )}${select(
          'Food precautions needed?',
          'allergy',
          c.allergy,
          [
            ['false', 'No'],
            ['true', 'Yes, follow parent instructions'],
          ],
          i,
          !state.feeding,
        )}</div></div></article>`,
    )
    .join('');
}
// Plain text for messaging a quote to parents.
function quoteText() {
  const r = calculate(state);
  const n = state.caregivers;
  const tasks = TASKS.filter(([k]) => state[k]).map(([, t]) => t.toLowerCase());
  return (
    `Childcare quote: ${plural(state.hours, 'hour')}, ${plural(state.children.length, 'child', 'children')}, ${plural(n, 'caregiver')}` +
    (tasks.length ? `, including ${tasks.join(', ')}` : '') +
    `. ${money(r.rate)}/hr` +
    (n > 1 ? ` total (${money(r.each)}/hr each)` : '') +
    `, ${money(r.total)} for the booking` +
    (n > 1 ? ` (${money(r.pay)} each)` : '') +
    `. Parents ${state.parents ? 'on site' : 'away'}.` +
    r.warnings.map((w) => `\nNote: ${w}`).join('')
  );
}
// Copy buttons are re-rendered with the quote, so their brief "Copied"
// confirmation lives here rather than on the element.
const copyStatus = {};
const copyButton = (kind, label) =>
  `<button data-copy="${kind}">${copyStatus[kind] || label}</button>`;
function updateResult() {
  const r = calculate(state);
  const line = (a, b) => `<div class="line"><span>${a}</span><b>${b}</b></div>`;
  $('result').innerHTML =
    `<div class="quote"><span class="quote-title">Team hourly estimate</span><div class="price">${money(r.rate)}<small> / hour</small></div><div class="per">${money(r.each)} / hour each · equal split</div>${state.children.length ? meter(r) : ''}<div class="total"><span>${state.hours}-hour booking<br>${state.caregivers} caregiver${state.caregivers === 1 ? '' : 's'}</span><strong>${money(r.total)}</strong></div><p class="quote-note">${money(r.pay)} each for the session. Each caregiver’s pay is rounded to a whole dollar.</p><div class="copy-row">${copyButton('quote', 'Copy quote')}${copyButton('link', 'Copy link')}</div><p class="quote-note">Links include names, ages and care details.</p></div><div class="white-card"><h3>Calculation</h3>${JSON.stringify(state.weights) === JSON.stringify(WEIGHTS) ? '' : '<p class="hint">Using custom weights (see Formula and assumptions).</p>'}${line('Combined base pay', money(state.children.length ? state.base * state.caregivers : 0) + '/hr')}${r.solo ? line('Sole caregiver', money(r.solo) + '/hr') : ''}${line('Workload premium', money(r.extra) + '/hr')}${line('Rounding adjustment', money(r.rate - r.raw) + '/hr')}<details ${keep('breakdown')}><summary>Workload by child</summary><div class="table-wrap"><table class="breakdown"><thead><tr><th>Child</th><th>Supervision</th><th>Attention¹</th><th>Tasks²</th><th>Total</th></tr></thead><tbody>${r.rows.map((c, i) => `<tr><td><i class="dot" style="${hueVar(state.children[i])}"></i>${esc(c.name)}</td><td>${c.supervision.toFixed(2)}</td><td>${(c.attention + c.settling).toFixed(2)}</td><td>${(c.toileting + c.feeding + c.bath + c.bed + c.allergy).toFixed(2)}</td><td>${c.total.toFixed(2)}</td></tr>`).join('')}</tbody></table></div><p class="hint">All values in points.<br>¹ Play attention + settling. ² Toileting, feeding, bathing, bedtime and food precautions.</p>${line('Group + space', (r.group + r.environment).toFixed(2) + ' pts')}${line('Total workload', r.workload.toFixed(2) + ' pts')}<p class="hint">Points describe care demands, not a rating of the child.</p></details>${r.warnings.map((w) => `<div class="note">${esc(w)}</div>`).join('')}</div>`;
  // Visual shortcut only; the full quote is the accessible source.
  const notes = r.warnings.length;
  $('mini').innerHTML =
    `<span><strong>${money(r.rate)}</strong>/hr · ${money(r.each)} each</span><button data-scroll="result" tabindex="-1" ${notes ? 'class="mini-notes"' : ''}>${notes ? `! ${plural(notes, 'note')}` : 'Details'}</button>`;
  $('comparisons').innerHTML = scenarios
    .map(([id, title, fn]) => {
      const copy = structuredClone(state);
      fn(copy);
      if (JSON.stringify(copy) === JSON.stringify(state)) return '';
      const q = calculate(copy);
      // Show both changes: one caregiver keeps the team rate but doubles pay.
      return `<button class="compare" data-scenario="${id}"><span>${title}</span><strong>${money(q.rate)}<small> /hr team</small></strong><small>${money(q.each)}/hr each</small><small>Team ${signed(q.rate - r.rate)} · each ${signed(q.each - r.each)}</small>${id === 'baby' ? '<small>Assumes asleep half the time; keeps selected tasks.</small>' : ''}</button>`;
    })
    .join('');
  const w = state.weights;
  $('math').innerHTML =
    `<div class="formula">Points are relative units, calibrated to the reference session.<br>Included workload/person: ${w.included.toFixed(3)} pts<br>Assigned average/person: ${r.load.toFixed(3)} pts (${(r.load / w.included).toFixed(2)}× the reference)<br>Premium = ${money(w.premium)} × max(0, total points − caregivers × ${w.included.toFixed(3)})<br>Team rate = base × caregivers + premium${state.caregivers === 1 ? ` + ${money(w.soloBonus)} sole caregiver` : ''}<br>Each caregiver’s booking pay rounds to the nearest dollar.</div><p>Reference: five children, two caregivers, two hours, parents handle personal care. Equal work sharing is assumed; actual assignments can be uneven.</p><details ${keep('assumptions')}><summary>All workload assumptions</summary><p>Age-based values change in straight lines between these ages, holding steady past the last one. Supervision points: ${anchors(w.supervision)}. Sleep retains ${pct(w.asleepSupervision)} of supervision. Extra play attention adds ${w.attention.occasional} / ${w.attention.frequent} / ${w.attention.constant} points while awake.</p><p>Settling: minutes entered (capped at the child’s awake time) as a share of the booking, × ${w.settling.holding} for holding or ${w.settling.active} for one-to-one.</p><p>Tasks count a caregiver’s minutes as a share of the booking, times a factor. Tasks away from the group (toileting, baths, bedtime) count ×${w.away.team} with a team, whose other members stretch to cover, and ×${w.away.solo} for one caregiver, who must manage the group too. Feeding happens with the group and partly overlaps supervision, so it counts ×${w.inRoom}.</p><p>Toileting: ${w.toiletingPerHour.diaper} minutes per hour for diapers, ${w.toiletingPerHour.help} for potty assistance. One meal: ${anchors(w.feedingMinutes)} minutes, plus ${w.allergyMinutes} per child with food precautions. One bath: ${w.bathMinutes} minutes. One bedtime: ${anchors(w.bedMinutes)} minutes.</p><p>Adult-led group play adds ${w.play.led} points per awake child; frequent mediation ${w.play.conflict}. Awake means each child’s average awake share, since sleep percentages don’t say who naps when. No group adjustment for one child. Divided sightlines add ${pct(w.splitSpace)} of supervision; parents being away adds ${pct(w.soleResponsibility)}, since there’s no backup. Heavy-load prompt appears above ${w.heavyLoad}× the reference load per caregiver; staffing prompts above ${w.maxChildrenPerCaregiver} children or ${w.maxUnder2PerCaregiver} under-2s per caregiver. These are editable-model heuristics, not safety limits.</p></details>`;
  try {
    history.replaceState(null, '', '#' + encode(state));
    $('undo').disabled = !undoStack.length;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({state: {...state, v: MODEL_VERSION}}),
    );
    $('saved').textContent = 'Saved on this device';
  } catch {
    $('saved').textContent = 'Storage unavailable; changes last for this visit';
  }
}
document.addEventListener('change', (e) => {
  const el = e.target;
  const key = el.dataset.key;
  if (!key) return;
  const target =
    el.dataset.index !== undefined && el.dataset.index !== ''
      ? state.children[Number(el.dataset.index)]
      : state;
  let value = el.type === 'checkbox' ? el.checked : el.value;
  if (el.type === 'number') {
    value = Number(value);
    if (!Number.isFinite(value)) value = Number(el.min);
    value = Math.min(Number(el.max), Math.max(Number(el.min), value));
    if (key === 'caregivers') value = Math.round(value);
    el.value = value;
  }
  if (key === 'settle') value = Number(value);
  if (['parents', 'allergy'].includes(key)) value = value === 'true';
  if (key === 'years' || key === 'mo') {
    const card = el.closest('.child');
    const y = card.querySelector('[data-key=years]');
    const m = card.querySelector('[data-key=mo]');
    target.months = Math.min(216, Number(y.value) * 12 + Number(m.value));
    y.value = Math.floor(target.months / 12);
    m.value = +(target.months % 12).toFixed(2);
  } else target[key] = value;
  // Patch the inputs in place rather than re-rendering them, so focus moves
  // normally to whatever field was tabbed or clicked into next.
  // Settling style only matters when the child needs settling.
  if (key === 'settle')
    el
      .closest('.child')
      .querySelector('[data-key=comfort]').parentElement.hidden = !value;
  if (key === 'name') {
    const card = el.closest('.child');
    const name = childName(target, Number(el.dataset.index));
    card.setAttribute('aria-label', name);
    card.querySelector('.remove').setAttribute('aria-label', 'Remove ' + name);
    card
      .querySelector('[data-key=years]')
      .setAttribute('aria-label', name + ', age in years');
    card
      .querySelector('[data-key=mo]')
      .setAttribute('aria-label', name + ', months');
  }
  // Toileting and food-precaution fields only show for tasks the caregivers
  // take on. Re-rendering the cards is safe here: focus is on the checkbox.
  if (key === 'diapers' || key === 'feeding') renderChildren();
  refresh();
});
// A field commits on blur, which can happen on pointerdown over a button.
// Refreshing then would replace that button mid-click and swallow the click,
// so the refresh waits until the click has landed.
let pointerDown = false;
let refreshPending = false;
function refresh() {
  if (pointerDown) refreshPending = true;
  else updateResult();
}
addEventListener('pointerdown', () => (pointerDown = true), true);
// pointercancel covers touch scrolls that never send pointerup.
for (const type of ['pointerup', 'pointercancel'])
  addEventListener(
    type,
    () => {
      pointerDown = false;
      if (!refreshPending) return;
      refreshPending = false;
      setTimeout(updateResult);
    },
    true,
  );
// Disclosures inside re-rendered markup keep their open state.
const openState = {};
const keep = (id) => `data-keep="${id}" ${openState[id] ? 'open' : ''}`;
addEventListener(
  'toggle',
  (e) => {
    if (e.target.dataset?.keep)
      openState[e.target.dataset.keep] = e.target.open;
  },
  true,
);
document.addEventListener('click', (e) => {
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    const i = Number(remove.dataset.remove);
    remember();
    state.children.splice(i, 1);
    render();
    // Focus the card that took its place, the one before, or Add child.
    const names = document.querySelectorAll('.name');
    (names[Math.min(i, names.length - 1)] || $('add')).focus();
  }
  const btn = e.target.closest('[data-scenario]');
  if (btn) {
    remember();
    const id = btn.dataset.scenario;
    scenarios.find((x) => x[0] === id)[2](state);
    render();
    // An applied option disappears; keep focus in the comparisons.
    (document.querySelector('.compare') || $('add')).focus();
  }
});
$('reset').onclick = () => {
  remember();
  state = example();
  render();
};
$('blank').onclick = () => {
  remember();
  state = {...state, children: []};
  render();
  $('add').focus();
};
$('undo').onclick = () => {
  if (!undoStack.length) return;
  state = undoStack.pop();
  render();
};
// A pasted link in an open tab replaces the plan (undoably).
addEventListener('hashchange', () => {
  try {
    const linked = sanitize(decode(location.hash.slice(1)));
    if (!linked || encode(linked) === encode(state)) return;
    remember();
    state = linked;
    render();
  } catch {
    // Ignore a mangled hash.
  }
});
// Built from state at the moment of copying, so it can't lag behind an edit
// or pick up an in-page anchor.
const shareLink = () =>
  location.origin + location.pathname + '#' + encode(state);
async function copy(kind) {
  try {
    await navigator.clipboard.writeText(
      kind === 'link' ? shareLink() : quoteText(),
    );
    copyStatus[kind] = 'Copied';
  } catch {
    copyStatus[kind] = 'Copy failed';
  }
  updateResult();
  setTimeout(() => {
    delete copyStatus[kind];
    updateResult();
  }, 1500);
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (btn) copy(btn.dataset.copy);
});
// One floating tooltip for anything with data-tip (the meter's segments).
const tip = $('tip');
document.addEventListener('pointermove', (e) => {
  const el = e.target.closest?.('[data-tip]');
  tip.hidden = !el;
  if (!el) return;
  tip.textContent = el.dataset.tip;
  tip.style.left =
    Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = e.clientY + 16 + 'px';
});
// Scroll without touching the URL hash, which holds the plan.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-scroll]');
  if (btn) $(btn.dataset.scroll).scrollIntoView({behavior: 'smooth'});
});
$('add').onclick = () => {
  if (state.children.length >= MAX_CHILDREN) return;
  state.children.push(child());
  render();
  const names = document.querySelectorAll('.name');
  names[names.length - 1].focus();
};
render();
