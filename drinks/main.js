import {menu} from './menu.js';
import {drinkName, extras, recipe, textOrder} from './order.js';
import {fromHash, randomPath, toHash, walk} from './path.js';
import {roast} from './roasts.js';
import {
  bindGlobalHaptics,
  bindMouseTracking,
  show,
  unleashConfetti,
} from './ui.js';

/** @typedef {import('./path.js').Path} Path */

const app = /** @type {HTMLElement} */ (
  document.getElementById('app-container')
);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// The URL hash holds the order so far, so reloading and the browser's back
// button just work. history.state.n counts how many screens deep we are, and
// history.state.sent marks the screen after "Send it".

/** @type {Path} */
let path = [];
let current = walk([]);
/** Options picked so far on a multi-select question. */
const selections = new Set();
/** Ignore taps that land on the next screen while it fades in. */
let renderedAt = 0;
/** True once the guest has left for Messages and not come back yet. */
let inMessages = false;
let titleTaps = 0;
let titleTimer = 0;

function render() {
  const hashPath = fromHash();
  current = walk(hashPath);
  path = hashPath.slice(0, current.steps.length);
  if (path.length < hashPath.length) {
    history.replaceState(history.state, '', urlFor(path));
  }
  selections.clear();
  renderedAt = performance.now();

  const {nodeId, drink, mods} = current;
  if (nodeId) show(app, questionHtml(nodeId));
  else if (history.state?.sent) show(app, sentHtml(drink, mods));
  else show(app, drinkHtml(drink, mods));
}

/** @param {Path} path */
const urlFor = (path) => (path.length ? toHash(path) : location.pathname);

/**
 * @param {Path} newPath
 * @param {boolean} [surprise] whether Surprise Me picked it, so it can be re-rolled
 */
function go(newPath, surprise = false) {
  history.pushState(
    {n: (history.state?.n ?? 0) + 1, surprise},
    '',
    urlFor(newPath),
  );
  render();
}

/** Swaps the surprise for another, so Back still goes to the start. */
function reroll() {
  const rolls = (history.state?.rolls ?? 0) + 1;
  history.replaceState({...history.state, rolls}, '', urlFor(randomPath()));
  render();
}

function back() {
  if (history.state?.n) {
    history.back();
  } else {
    // Opened straight onto this screen, so there's nothing in history to go back to.
    history.replaceState(null, '', urlFor(path.slice(0, -1)));
    render();
  }
}

function send() {
  if (history.state?.sent) {
    history.replaceState({...history.state, confirmed: false}, '');
  } else {
    history.pushState({n: (history.state?.n ?? 0) + 1, sent: true}, '');
  }
  render();
  inMessages = true;
  textOrder(current.drink, current.mods);
}

function confirmSent() {
  inMessages = false;
  history.replaceState({...history.state, confirmed: true}, '');
  render();
  setTimeout(() => unleashConfetti(app), 300);
}

// Coming back from Messages almost always means they sent it.
document.addEventListener('visibilitychange', () => {
  if (
    document.visibilityState === 'visible' &&
    inMessages &&
    history.state?.sent
  ) {
    confirmSent();
  }
});

// --- Screens ---

const rerollLabels = [
  'Roll again',
  'Again?',
  'Commitment issues?',
  'You know you can just pick one',
  'The dice are getting tired',
  'Fine.',
];

/**
 * @param {number} picked
 * @param {number} total
 */
function continueLabel(picked, total) {
  if (!picked) return 'Skip (no joy, thanks)';
  if (picked === total && total > 3)
    return 'Continue (all of it, apparently) ➔';
  if (picked >= 5) return 'Continue (diabetes speedrun) ➔';
  if (picked >= 3) return 'Continue (living dangerously) ➔';
  return 'Continue ➔';
}

const topBar = () => `
  <header class="top-bar">
    <button type="button" class="top-btn" data-action="back">‹ Back</button>
    <button type="button" class="top-btn" data-action="restart">Start over</button>
  </header>`;

/** What's been picked so far. Tapping one goes back to that question. */
function chipsHtml() {
  const chips = current.steps.flatMap((step, i) =>
    step.options
      .map((o) => o.chip ?? o.mod ?? o.drink?.name)
      .filter(Boolean)
      .map(
        (text) =>
          `<button type="button" class="chip" data-step="${i}" aria-label="Change ${text}">${text}</button>`,
      ),
  );
  return chips.length ? `<nav class="chips">${chips.join('')}</nav>` : '';
}

/** @param {string} nodeId */
function questionHtml(nodeId) {
  const node = menu[nodeId];
  let html =
    nodeId === 'start'
      ? `
        <div class="hero-emoji animate-in">✨</div>
        <div class="eyebrow animate-in">You've regretfully arrived at</div>
        <h1 class="title highlight animate-in" data-action="title">Andrew's<br>Coffee Bar</h1>
        <p class="lede animate-in">${node.question}</p>`
      : `${topBar()}${chipsHtml()}<h2 class="question animate-in">${node.question}</h2>`;

  /** @type {{title?: string, buttons: string[]}[]} */
  const groups = [];
  node.options.forEach((/** @type {any} */ option, /** @type {number} */ i) => {
    if (option.secret) return;
    let group = groups.at(-1);
    if (!group || group.title !== option.group) {
      groups.push((group = {title: option.group, buttons: []}));
    }
    const delay = `style="--i: ${Math.min(i, 12)}"`;
    group.buttons.push(
      node.multi
        ? `<button type="button" class="tile animate-in" ${delay} data-toggle="${i}" aria-pressed="false">${option.label}</button>`
        : node.grid
          ? `<button type="button" class="tile animate-in" ${delay} data-pick="${i}">${option.label}</button>`
          : `<button type="button" class="btn animate-in" ${delay} data-pick="${i}">${option.label}</button>`,
    );
  });
  const layout = node.multi || node.grid ? 'grid' : 'list';
  for (const {title, buttons} of groups) {
    if (title) html += `<h3 class="group-title animate-in">${title}</h3>`;
    html += `<div class="options ${layout}">${buttons.join('')}</div>`;
  }

  if (nodeId === 'start') return `<div class="center">${html}</div>`;
  if (node.multi) {
    html += `<div class="dock"><button type="button" class="btn" data-action="continue">${continueLabel(0, node.options.length)}</button></div>`;
  }
  return html;
}

/**
 * @param {any} drink
 * @param {string[]} mods
 */
const orderCard = (drink, mods) => `
  <div class="order-card animate-in">
    <div class="order-name">${drinkName(drink, mods)}</div>
    ${extras(mods).length ? `<div class="order-extras">${extras(mods).join(' · ')}</div>` : ''}
  </div>`;

/**
 * @param {any} drink
 * @param {string[]} mods
 */
const drinkHtml = (drink, mods) => `
  ${topBar()}
  ${chipsHtml()}
  <div class="drink">
    <p class="quote animate-in">“${roast(drink, mods)}”</p>
    <h1 class="drink-name highlight animate-in">${drinkName(drink, mods)}</h1>
    ${extras(mods).length ? `<p class="drink-extras animate-in">${extras(mods).join(' · ')}</p>` : ''}
    <p class="tagline animate-in">${recipe(drink, mods)}</p>
  </div>
  <div class="dock">
    <button type="button" class="btn" data-action="send">Send it 🚀</button>
    ${history.state?.surprise ? `<button type="button" class="btn btn-secondary" data-action="reroll">🎲 ${rerollLabels[Math.min(history.state.rolls ?? 0, rerollLabels.length - 1)]}</button>` : ''}
  </div>`;

function installHint() {
  const installed =
    matchMedia('(display-mode: standalone)').matches ||
    /** @type {any} */ (navigator).standalone;
  if (installed) return '';
  if (isIOS) {
    return `<p class="hint animate-in">Tip: tap Share, then “Add to Home Screen” and next time it's one tap away.</p>`;
  }
  if (/Android/.test(navigator.userAgent)) {
    return `<p class="hint animate-in">Tip: tap ⋮, then “Add to Home screen” and next time it's one tap away.</p>`;
  }
  return '';
}

/**
 * @param {any} drink
 * @param {string[]} mods
 */
function sentHtml(drink, mods) {
  if (!history.state?.confirmed) {
    return `
      ${topBar()}
      <div class="center">
        <div class="hero-emoji animate-in">📲</div>
        <h2 class="animate-in">Now hit send in Messages</h2>
        <p class="animate-in">Your order is waiting in a text to Andrew.</p>
        ${orderCard(drink, mods)}
        <p class="hint animate-in">Messages didn't open? Just show Andrew this screen.</p>
      </div>
      <div class="dock">
        <button type="button" class="btn" data-action="confirm">I sent it ✓</button>
        <button type="button" class="btn btn-secondary" data-action="send">Open Messages again</button>
      </div>`;
  }
  return `
    <div class="center">
      <div class="hero-emoji animate-in">🎉</div>
      <h1 class="highlight animate-in">Order in!</h1>
      <p class="animate-in">${drink.making}<br>He is legally obligated to make this.</p>
      ${orderCard(drink, mods)}
      ${installHint()}
    </div>
    <div class="dock">
      <button type="button" class="btn btn-secondary" data-action="restart">I panicked, start over 😰</button>
      <button type="button" class="link-btn" data-action="send">Didn't send? Try again</button>
    </div>`;
}

// --- Taps ---

app.addEventListener('click', (e) => {
  const el = /** @type {HTMLElement | null} */ (
    /** @type {HTMLElement} */ (e.target).closest(
      'button, [data-action="title"]',
    )
  );
  if (!el || performance.now() - renderedAt < 250) return;
  const {pick, toggle, step, action} = el.dataset;

  if (pick !== undefined) {
    const option = menu[/** @type {string} */ (current.nodeId)].options[pick];
    if (option.surprise) go(randomPath(), true);
    else go([...path, [Number(pick)]]);
  } else if (toggle !== undefined) {
    const i = Number(toggle);
    if (!selections.delete(i)) selections.add(i);
    el.setAttribute('aria-pressed', String(selections.has(i)));
    const continueBtn = app.querySelector('[data-action="continue"]');
    if (continueBtn) {
      continueBtn.textContent = continueLabel(
        selections.size,
        menu[/** @type {string} */ (current.nodeId)].options.length,
      );
    }
  } else if (step !== undefined) {
    go(path.slice(0, Number(step)));
  } else if (action === 'continue') {
    go([...path, [...selections].sort((a, b) => a - b)]);
  } else if (action === 'back') {
    back();
  } else if (action === 'restart') {
    go([]);
  } else if (action === 'reroll') {
    reroll();
  } else if (action === 'send') {
    send();
  } else if (action === 'confirm') {
    confirmSent();
  } else if (action === 'title') {
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => (titleTaps = 0), 1000);
    if (++titleTaps === 7) {
      titleTaps = 0;
      go([[menu.start.options.findIndex((/** @type {any} */ o) => o.secret)]]);
    }
  }
});

window.addEventListener('popstate', () => {
  inMessages = false;
  render();
});

bindMouseTracking();
bindGlobalHaptics();
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
