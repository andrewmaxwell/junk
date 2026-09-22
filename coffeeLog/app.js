import { ADD_NEW, FIRST_BATCH, DEFAULT_DRINKS, INITIAL_CHOICES, unique, localDateTime, timestampWithOffset, batchLabel, validateDrink, validEndpoint } from './model.js';
import { request } from './transport.js';

const $ = id => document.getElementById(id);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`coffee-log:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`coffee-log:${key}`, JSON.stringify(value)); } catch { /* Logging still works without local storage. */ } }
};
let endpoint = storage.get('endpoint', '') || window.COFFEE_LOG_CONFIG?.endpoint || '';
let choices = storage.get('choices', INITIAL_CHOICES);
if (!choices || !['drinkers', 'milks', 'batches'].every(key => Array.isArray(choices[key]))) choices = INITIAL_CHOICES;
choices.drinks = unique([...DEFAULT_DRINKS, ...(Array.isArray(choices.drinks) ? choices.drinks : [])]);
let batchLabels = storage.get('batch-labels', {});
if (!batchLabels || typeof batchLabels !== 'object') batchLabels = {};
let lastPair = storage.get('last-pair', [FIRST_BATCH, '']);
if (!Array.isArray(lastPair)) lastPair = [FIRST_BATCH, ''];
let pending = null;
try { pending = JSON.parse(sessionStorage.getItem('coffee-log:pending')); } catch { /* No pending save. */ }
if (!pending?.drink?.drink_id || !validEndpoint(pending.endpoint)) pending = null;
let busy = false;
let bootstrapBusy = false;
let draftTouched = false;
let saveRevision = 0;
const remembered = [['drink-type', 'drinks'], ['drinker', 'drinkers'], ['milk', 'milks'], ['batch-1', 'batches'], ['batch-2', 'batches']];

function valueOf(id) { return ($(id).value === ADD_NEW ? $(`${id}-new`).value : $(id).value).trim(); }
function radioValue(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function canonical(value, values) { return values.find(item => item.toLowerCase() === value.toLowerCase()) || value; }
function isAndrew() { return valueOf('drinker').toLowerCase() === 'andrew'; }
function setRadio(name, value) { document.querySelectorAll(`input[name="${name}"]`).forEach(input => { input.checked = input.value === String(value); }); }
function savePending() {
  try {
    if (pending) sessionStorage.setItem('coffee-log:pending', JSON.stringify(pending));
    else sessionStorage.removeItem('coffee-log:pending');
  } catch { /* The current page still retains its request ID. */ }
}

function populate(id, values, selection = '') {
  const select = $(id);
  select.replaceChildren();
  if (id.startsWith('batch')) select.add(new Option('Choose a batch…', ''));
  const all = unique([...values, selection], id.startsWith('batch'));
  all.forEach(value => select.add(new Option(id.startsWith('batch') ? (batchLabels[value] || batchLabel(value)) : value, value)));
  select.add(new Option(`+ Add new ${id === 'drinker' ? 'drinker' : id === 'milk' ? 'milk' : id === 'drink-type' ? 'drink' : 'batch'}…`, ADD_NEW));
  select.value = selection;
  $(`${id}-new`).hidden = true;
  $(`${id}-new`).required = false;
}

function renderChoices(selections = {}) {
  for (const [id, key] of remembered) {
    const values = key === 'drinkers' ? unique(['Andrew', ...choices[key]]) : key === 'milks' ? unique(['Whole milk', 'None', ...choices[key]]) : choices[key];
    populate(id, values, selections[id] ?? valueOf(id));
  }
}

function updateConditionalFields() {
  const half = radioValue('caffeine') === 'Half-caf';
  $('batch-2-field').hidden = !half;
  $('batch-2').disabled = !half;
  $('batch-2-new').disabled = !half;
  $('batch-1-label').textContent = half ? 'Regular batch' : radioValue('caffeine') === 'Decaf' ? 'Decaf batch' : 'Roast batch';
  $('blend-hint').textContent = half ? 'Two roast batches, mixed 50/50.' : 'Select a roast batch.';
  const mine = isAndrew();
  $('rating-field').hidden = !mine;
  $('rating-field').disabled = !mine;
  $('guest-hint').hidden = mine;
  if (!mine) setRadio('rating', '');
  $('clear-rating').hidden = !radioValue('rating');
}

function setEarlierMode(enabled) {
  $('custom-time-field').hidden = !enabled;
  $('custom-time').required = enabled;
  $('earlier-button').setAttribute('aria-expanded', String(enabled));
  $('earlier-button').textContent = enabled ? 'Use current time' : 'Earlier drink';
}

function resetForm() {
  $('drink-form').reset();
  $('custom-time').value = localDateTime();
  setEarlierMode(false);
  renderChoices({ 'drink-type': 'Latte', drinker: 'Andrew', milk: 'Whole milk', 'batch-1': lastPair[0] || '', 'batch-2': lastPair[1] || '' });
  updateConditionalFields();
  draftTouched = false;
}

function restorePending() {
  if (!pending) return;
  const d = pending.drink;
  renderChoices({ 'drink-type': d.drink_type, drinker: d.drinker, milk: d.milk, 'batch-1': d.batch_1_filename, 'batch-2': d.batch_2_filename });
  setRadio('caffeine', d.caffeine); setRadio('rating', d.rating);
  $('notes').value = d.notes;
  $('custom-time').value = localDateTime(new Date(d.drank_at));
  setEarlierMode(true);
  updateConditionalFields();
  $('entry-fields').disabled = true;
  $('save-button').textContent = 'Retry this drink';
  showStatus('This drink is awaiting confirmation. Retry checks the same drink without adding it twice.', true);
}

function showStatus(message, error = false) {
  $('save-status').textContent = message;
  $('save-status').dataset.error = String(error);
}

function showConnection(message, action = 'Settings') {
  $('connection-notice').hidden = !message;
  $('connection-text').textContent = message;
  $('connect-button').textContent = action;
  $('batch-help').hidden = !message;
}

function applyBootstrap(data, selectDefaults) {
  if (!data || !data.choices || !['drinkers', 'milks', 'batches'].every(key => Array.isArray(data.choices[key]))) throw new Error('The web app returned an unexpected response. Check that it uses the included script.');
  if (data.version !== 2) throw new Error('Update the Google Apps Script, run setup, and deploy a new version to load drinks and the Batches tab.');
  batchLabels = data.batchLabels || {};
  storage.set('batch-labels', batchLabels);
  choices = {
    drinks: unique([...DEFAULT_DRINKS, ...(data.choices.drinks || [])]),
    drinkers: unique(['Andrew', ...data.choices.drinkers]),
    milks: unique(['Whole milk', 'None', ...data.choices.milks]),
    batches: unique(data.choices.batches, true)
  };
  // The example is only a first-run suggestion, never a replacement for sheet data.

  const previousPair = lastPair;
  lastPair = Array.isArray(data.lastPair) ? data.lastPair : previousPair;
  lastPair = [lastPair[0], lastPair[1]].map(value => choices.batches.includes(value) ? value : '');

  storage.set('choices', choices); storage.set('last-pair', lastPair);
  if (selectDefaults && !pending) resetForm(); else if (!pending) renderChoices();
  if (typeof data.sheetUrl === 'string' && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(data.sheetUrl)) {
    $('sheet-link').href = data.sheetUrl; $('sheet-link').hidden = false;
  }
}

async function refreshChoices() {
  if (!endpoint || busy || bootstrapBusy || pending) return;
  bootstrapBusy = true;
  const revision = saveRevision;
  const requestedEndpoint = endpoint;
  try {
    const data = await request(requestedEndpoint, 'bootstrap');
    if (busy || pending || revision !== saveRevision || requestedEndpoint !== endpoint) return;
    applyBootstrap(data, !draftTouched);
    showConnection('');
  } catch (error) {
    showConnection(error.message);
  } finally { bootstrapBusy = false; }
}

for (const [id] of remembered) {
  $(id).addEventListener('change', () => {
    const isNew = $(id).value === ADD_NEW;
    $(`${id}-new`).hidden = !isNew;
    $(`${id}-new`).required = isNew;
    if (isNew) { $(`${id}-new`).value = ''; $(`${id}-new`).focus(); }
    updateConditionalFields();
  });
  $(`${id}-new`).addEventListener('input', updateConditionalFields);
}
$('drink-form').addEventListener('input', () => { draftTouched = true; });
$('drink-form').addEventListener('change', () => { draftTouched = true; updateConditionalFields(); });
$('clear-rating').addEventListener('click', () => { setRadio('rating', ''); updateConditionalFields(); });
$('earlier-button').addEventListener('click', () => {
  const enabled = $('custom-time-field').hidden;
  if (enabled) $('custom-time').value = localDateTime();
  setEarlierMode(enabled);
  draftTouched = true;
});

$('drink-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  if (!endpoint && !pending) { showStatus('Connect Google Sheets before saving your first drink.', true); openSettings(); return; }
  try {
    if (!pending) {
      const date = $('custom-time-field').hidden ? new Date() : new Date($('custom-time').value);
      const half = radioValue('caffeine') === 'Half-caf';
      const drink = validateDrink({
        drink_id: crypto.randomUUID(), drank_at: timestampWithOffset(date),
        drinker: canonical(valueOf('drinker'), choices.drinkers),
        drink_type: canonical(valueOf('drink-type'), choices.drinks), caffeine: radioValue('caffeine'),
        milk: canonical(valueOf('milk'), choices.milks), batch_1_filename: valueOf('batch-1'),
        batch_2_filename: half ? valueOf('batch-2') : '', batch_1_percent: half ? 50 : 100,
        rating: isAndrew() && radioValue('rating') ? Number(radioValue('rating')) : '', notes: $('notes').value.trim()
      });
      pending = { endpoint, drink };
      savePending();
    }
    busy = true;
    saveRevision++;
    $('entry-fields').disabled = true; $('save-button').disabled = true;
    $('save-button').textContent = 'Saving…';
    showStatus('');
    const saved = pending.drink;
    const result = await request(pending.endpoint, 'log', saved);
    if (result?.drinkId !== saved.drink_id) throw new Error('The save response could not be confirmed.');
    choices.drinks = unique([...choices.drinks, saved.drink_type]);
    choices.drinkers = unique([...choices.drinkers, saved.drinker]);
    choices.milks = unique([...choices.milks, saved.milk]);
    choices.batches = unique([...choices.batches, saved.batch_1_filename, saved.batch_2_filename], true);
    if (saved.drinker.toLowerCase() === 'andrew' && saved.caffeine === 'Half-caf') lastPair = [saved.batch_1_filename, saved.batch_2_filename];
    storage.set('choices', choices); storage.set('last-pair', lastPair);
    pending = null; savePending(); resetForm();
    showConnection('');
    showStatus(`✓ Saved to Google Sheets. ${saved.drink_type} for ${saved.drinker}${saved.rating ? ` · ${saved.rating}/5` : ''}.`);
  } catch (error) {
    if (error.definitive) { pending = null; savePending(); }
    showStatus(pending ? `${error.message} Your drink is kept here. Retry sends the same drink safely; edit it in Sheets after confirmation.` : error.message, true);
  } finally {
    busy = false;
    $('entry-fields').disabled = Boolean(pending);
    $('save-button').disabled = false;
    $('save-button').textContent = pending ? 'Retry this drink' : 'Log drink ↗';
  }
});

function openSettings() {
  $('endpoint').value = endpoint;
  $('settings-status').textContent = '';
  $('settings-dialog').showModal();
}
$('settings-button').addEventListener('click', openSettings);
$('connect-button').addEventListener('click', openSettings);
$('close-settings').addEventListener('click', () => $('settings-dialog').close());
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const candidate = $('endpoint').value.trim();
  if (pending || busy) { $('settings-status').textContent = 'Confirm the pending drink before changing the connection.'; return; }
  if (!validEndpoint(candidate)) { $('settings-status').textContent = 'Use the deployed https://script.google.com/macros/s/…/exec URL.'; return; }
  $('connect-save').disabled = true;
  $('settings-status').textContent = 'Checking your spreadsheet…';
  try {
    const result = await request(candidate, 'bootstrap');
    applyBootstrap(result, !draftTouched);
    endpoint = candidate; storage.set('endpoint', endpoint);
    $('settings-dialog').close(); showConnection('');
    showStatus('Google Sheets connected.');
  } catch (error) { $('settings-status').textContent = error.message; }
  finally { $('connect-save').disabled = false; }
});

let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('install-button').hidden = false; });
$('install-button').addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt(); installPrompt = null; $('install-button').hidden = true;
});
window.addEventListener('appinstalled', () => { $('install-button').hidden = true; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshChoices(); });
window.addEventListener('online', refreshChoices);

resetForm();
if (pending) restorePending();
if (!endpoint) showConnection('Google Sheets is not connected.', 'Connect Sheets ↗');
else { showConnection(''); refreshChoices(); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { /* App works without installation. */ });
