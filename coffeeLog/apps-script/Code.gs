/**
 * Coffee Log — paste into a spreadsheet's Extensions → Apps Script project.
 * Run setup() once. Deploy as a web app: Execute as Me; Who has access: Anyone.
 * No Google sign-in is required for logging. Keep the spreadsheet itself private.
 */
const HEADERS = ['drink_id', 'drank_at', 'created_at', 'drinker', 'drink_type', 'caffeine', 'milk', 'batch_1_filename', 'batch_2_filename', 'batch_1_percent', 'rating', 'notes'];
const TAB_NAME = 'Drinks';
const BATCH_HEADERS = ['filename', 'label', 'active'];
const DEFAULT_DRINKS = ['Latte', 'Cortado', 'Iced Latte', 'Frappe'];

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open Apps Script from your Google spreadsheet first.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', book.getId());
    let sheet = book.getSheetByName(TAB_NAME);
    if (!sheet) sheet = book.insertSheet(TAB_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#eee7db');
      sheet.autoResizeColumns(1, HEADERS.length);
      sheet.setColumnWidth(8, 310); sheet.setColumnWidth(9, 310); sheet.setColumnWidth(12, 350);
    }
    const rows = readRows_(sheet);
    setupBatches_(book, rows);
    console.log('Coffee Log is ready: ' + book.getUrl());
  } finally { lock.releaseLock(); }
}

function doGet() {
  return HtmlService.createHtmlOutput('<h1>Coffee Log is ready</h1><p>Paste this deployment’s /exec URL into Coffee Log settings.</p>');
}

function doPost(event) {
  const params = event && event.parameter || {};
  const requestId = String(params.requestId || '');
  const origin = String(params.parentOrigin || '');
  if (!/^[a-f0-9-]{36}$/i.test(requestId) || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return HtmlService.createHtmlOutput('Invalid request.');
  }
  let response;
  try {
    if (String(params.payload || '').length > 16000) invalid_('The drink is too large. Shorten the notes.');
    if (!['bootstrap', 'log'].includes(params.action)) invalid_('Unknown action.');
    let payload;
    try { payload = JSON.parse(params.payload || '{}'); } catch (_) { invalid_('Invalid drink data.'); }
    response = { ok: true, result: handle_(params.action, payload) };
  } catch (error) {
    response = { ok: false, error: error.message || 'Unable to save. Please retry.', definitive: error.definitive === true };
  }
  response.channel = 'coffee-log-v1'; response.requestId = requestId;
  // Escape HTML metacharacters so free text can never end the script element.
  const json = JSON.stringify(response).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const html = '<!doctype html><html><body><script>window.top.postMessage(' + json + ',' + JSON.stringify(origin) + ');</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function handle_(action, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!id) invalid_('Run setup in the spreadsheet’s Apps Script project first.');
    const book = SpreadsheetApp.openById(id);
    const sheet = book.getSheetByName(TAB_NAME);
    if (!sheet) invalid_('The Drinks tab is missing. Restore it or run setup.');
    const rows = readRows_(sheet);
    if (action === 'bootstrap') return bootstrap_(rows, book.getUrl(), readBatches_(book));
    const drink = validate_(payload);
    const duplicate = rows.find(row => String(row.drink_id) === drink.drink_id);
    if (duplicate) return { drinkId: drink.drink_id, duplicate: true };
    const headers = sheet.getDataRange().getValues()[0].slice(0, sheetHeaders_(sheet).length);
    const values = headers.map(header => header === 'created_at' ? new Date().toISOString() : header === 'temperature' ? '' : drink[header]);
    const nextRow = sheet.getLastRow() + 1;
    if (nextRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    const range = sheet.getRange(nextRow, 1, 1, headers.length);
    range.setNumberFormat('@');
    sheet.getRange(nextRow, headers.indexOf('batch_1_percent') + 1, 1, 2).setNumberFormat('0');
    range.setValues([values.map(literal_)]);
    // Do not mark errors after a possible write as definitive: a retry must
    // retain its ID, even when Sheets committed but flush/response failed.
    SpreadsheetApp.flush();
    return { drinkId: drink.drink_id, duplicate: false };
  } finally { lock.releaseLock(); }
}

function sheetHeaders_(sheet) {
  const headers = sheet.getDataRange().getValues()[0] || [];
  // Existing logs may retain their historical temperature column. Never delete
  // data during an upgrade; new entries simply leave that old column blank.
  const core = headers.filter(header => header !== 'temperature');
  if (core.length !== HEADERS.length || !HEADERS.every((header, i) => core[i] === header) || headers.filter(h => h === 'temperature').length > 1) invalid_('The Drinks column headers have changed. Restore the original headers before logging.');
  return headers;
}

function readRows_(sheet) {
  const headers = sheetHeaders_(sheet);
  return sheet.getDataRange().getValues().slice(1)
    .filter(row => row.some(value => value !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}

function setupBatches_(book, rows) {
  let sheet = book.getSheetByName('Batches');
  if (!sheet) sheet = book.insertSheet('Batches');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, BATCH_HEADERS.length).setValues([BATCH_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, BATCH_HEADERS.length).setFontWeight('bold').setBackground('#eee7db');
    sheet.setColumnWidth(1, 400); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 80);
    const filenames = [...new Set(rows.flatMap(row => [row.batch_1_filename, row.batch_2_filename]).filter(Boolean))];
    if (!filenames.length) filenames.push('#32_colombian_supremo_26-09-21_1432.alog');
    if (filenames.length + 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), filenames.length + 1 - sheet.getMaxRows());
    sheet.getRange(2, 1, filenames.length, 3).setValues(filenames.map(filename => [literal_(String(filename)), '', true]));
  }
  readBatches_(book);
}

function readBatches_(book) {
  const sheet = book.getSheetByName('Batches');
  if (!sheet) invalid_('Run setup again to create the Batches tab, then deploy the updated script.');
  const values = sheet.getDataRange().getValues();
  if (!BATCH_HEADERS.every((header, index) => values[0] && values[0][index] === header)) invalid_('The Batches tab needs these headers: filename, label, active.');
  return values.slice(1).map(row => ({
    filename: String(row[0] || '').trim(), label: String(row[1] || '').trim(),
    active: !['false', 'no', '0'].includes(String(row[2]).trim().toLowerCase())
  })).filter(batch => batch.filename);
}

function bootstrap_(rows, sheetUrl, catalog) {
  const distinct = (values, sensitive) => {
    const seen = new Set();
    return values.map(value => String(value == null ? '' : value).trim()).filter(value => {
      const key = sensitive ? value : value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key); return true;
    });
  };
  const recent = rows.slice().reverse().sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const pair = recent.find(row => String(row.drinker).trim().toLowerCase() === 'andrew' && row.caffeine === 'Half-caf' && row.batch_1_filename && row.batch_2_filename);
  const inactive = new Set(catalog.filter(batch => !batch.active).map(batch => batch.filename));
  const batches = distinct([
    ...catalog.filter(batch => batch.active).map(batch => batch.filename),
    ...recent.flatMap(row => [row.batch_1_filename, row.batch_2_filename])
  ], true).filter(filename => !inactive.has(filename));
  return {
    version: 2,
    choices: {
      drinks: distinct([...DEFAULT_DRINKS, ...recent.map(row => row.drink_type)]),
      drinkers: distinct(recent.map(row => row.drinker)),
      milks: distinct(recent.map(row => row.milk)),
      batches
    },
    batchLabels: Object.fromEntries(catalog.filter(batch => batch.active && batch.label).map(batch => [batch.filename, batch.label])),
    lastPair: pair ? [String(pair.batch_1_filename).trim(), String(pair.batch_2_filename).trim()].map(filename => batches.includes(filename) ? filename : '') : null,
    hasDrinks: rows.length > 0, sheetUrl
  };
}

function invalid_(message) {
  const error = new Error(message); error.definitive = true; throw error;
}

function validate_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid_('Invalid drink.');
  const text = (key, max, optional) => {
    if (typeof input[key] !== 'string') invalid_('Invalid ' + key + '.');
    const value = input[key].trim();
    if ((!optional && !value) || value.length > max || /\u0000/.test(value)) invalid_('Check ' + key + '.');
    return value;
  };
  const drink = {
    drink_id: text('drink_id', 36), drank_at: text('drank_at', 40), drinker: text('drinker', 80),
    drink_type: text('drink_type', 80), caffeine: text('caffeine', 12),
    milk: text('milk', 80), batch_1_filename: text('batch_1_filename', 240),
    batch_2_filename: text('batch_2_filename', 240, true), notes: text('notes', 4000, true)
  };
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(drink.drink_id)) invalid_('Invalid drink ID.');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(drink.drank_at) || !Number.isFinite(Date.parse(drink.drank_at))) invalid_('Invalid date and time.');
  if (!['Regular', 'Half-caf', 'Decaf'].includes(drink.caffeine)) invalid_('Choose a valid caffeine option.');
  if (drink.caffeine === 'Half-caf') {
    if (!drink.batch_2_filename || drink.batch_1_filename === drink.batch_2_filename) invalid_('Half-caf needs two different roast batches.');
    drink.batch_1_percent = 50;
  } else { drink.batch_2_filename = ''; drink.batch_1_percent = 100; }
  if (drink.drinker.toLowerCase() === 'andrew') {
    drink.drinker = 'Andrew';
    if (input.rating !== '' && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) invalid_('Rating must be blank or 1–5.');
    drink.rating = input.rating;
  } else drink.rating = '';
  return drink;
}

function literal_(value) {
  // Sheets treats leading '=' as a formula. Prefix potentially active text
  // with an apostrophe; it displays and reads back as the original text.
  return typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
}
