// Page state, undo and events. The math is in model.js, the markup in
// view.js, saving and links in storage.js, and the weights panel in
// weightsPanel.js.
import {
  example,
  addedChild,
  childName,
  calculate,
  scenarios,
  WEIGHTS,
  MAX_CHILDREN,
} from './model.js';
import {encode, loadState, readLink, save} from './storage.js';
import {
  assignHues,
  sessionHtml,
  childrenHtml,
  resultHtml,
  summaryText,
  miniHtml,
  comparisonsHtml,
  mathHtml,
  openState,
} from './view.js';
import {initWeightsPanel, showWeights} from './weightsPanel.js';
const $ = (id) => document.getElementById(id);

let state = loadState();
// Snapshots taken before buttons that replace or remove things.
const undoStack = [];
function remember() {
  undoStack.push(structuredClone(state));
  if (undoStack.length > 30) undoStack.shift();
}

initWeightsPanel({
  container: $('weights'),
  onChange: () => updateResult(),
  onRestore: () => {
    remember();
    state.weights = structuredClone(WEIGHTS);
    render();
  },
});

// Re-renders every input. Only for button clicks (add, remove, reset,
// comparisons), never from the change handler, where it would drop focus.
function render() {
  assignHues(state.children);
  $('add').disabled = state.children.length >= MAX_CHILDREN;
  $('add').title = $('add').disabled ? `Up to ${MAX_CHILDREN} children` : '';
  $('session').innerHTML = sessionHtml(state);
  renderChildren();
  showWeights(state.weights);
  updateResult();
}
function renderChildren() {
  $('children').innerHTML = childrenHtml(state);
}
// Everything that follows from the inputs, without touching the inputs.
function updateResult() {
  const r = calculate(state);
  $('result').innerHTML = resultHtml(state, r);
  // The quote card is re-rendered on every edit, so screen readers hear only
  // this summary, and only when it changes.
  const summary = summaryText(r);
  if ($('announce').textContent !== summary)
    $('announce').textContent = summary;
  $('mini').innerHTML = miniHtml(r);
  $('comparisons').innerHTML = comparisonsHtml(state, r);
  $('math').innerHTML = mathHtml(state, r);
  $('undo').disabled = !undoStack.length;
  $('saved').textContent = save(state)
    ? 'Saved on this device. The page address links to this plan, including names and care details.'
    : 'Storage unavailable; changes last for this visit';
}
// Patches a card after an edit: names in its labels, and fields that only
// matter for some choices.
function patchCard(card, c, i) {
  const name = childName(c, i);
  const field = (key) => card.querySelector(`[data-key=${key}]`);
  card.setAttribute('aria-label', name);
  card.querySelector('.remove').setAttribute('aria-label', 'Remove ' + name);
  field('years').setAttribute('aria-label', name + ', age in years');
  field('mo').setAttribute('aria-label', name + ', months');
  field('comfort').parentElement.hidden = !c.settle;
  field('toilet').parentElement.hidden = !c.diapers;
  field('allergy').parentElement.hidden = !c.feeding;
}

document.addEventListener('change', (e) => {
  const el = e.target;
  const key = el.dataset.key;
  if (!key) return;
  const card = el.closest('.child');
  const target = card ? state.children[Number(el.dataset.index)] : state;
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
    const y = card.querySelector('[data-key=years]');
    const m = card.querySelector('[data-key=mo]');
    target.months = Math.min(216, Number(y.value) * 12 + Number(m.value));
    y.value = Math.floor(target.months / 12);
    m.value = +(target.months % 12).toFixed(2);
  } else target[key] = value;
  if (card) patchCard(card, target, Number(el.dataset.index));
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
  // Scroll without touching the URL hash, which holds the plan.
  const scroll = e.target.closest('[data-scroll]');
  if (scroll) $(scroll.dataset.scroll).scrollIntoView({behavior: 'smooth'});
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
$('add').onclick = () => {
  if (state.children.length >= MAX_CHILDREN) return;
  state.children.push(addedChild(state));
  render();
  const names = document.querySelectorAll('.name');
  names[names.length - 1].focus();
};
// A pasted link in an open tab replaces the plan (undoably).
addEventListener('hashchange', () => {
  const linked = readLink();
  if (!linked || encode(linked) === encode(state)) return;
  remember();
  state = linked;
  render();
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
render();
